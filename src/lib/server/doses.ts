import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedMinuteToIso } from "@/lib/time/zoned";
import { parseClock } from "@/domain/scheduling";

export async function ownedDose(supabase: SupabaseClient, userId: string, doseId: string) {
  const { data, error } = await supabase.from("scheduled_doses").select("*,daily_schedules!inner(id,user_id,date)").eq("id", doseId).eq("daily_schedules.user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function cancelQueuedNotifications(supabase: SupabaseClient, doseId: string) {
  await supabase.from("notification_jobs").update({ status: "cancelled" }).eq("scheduled_dose_id", doseId).eq("status", "queued");
}

export async function markDoseTaken(supabase: SupabaseClient, userId: string, doseId: string, takenTime: string) {
  const dose = await ownedDose(supabase, userId, doseId);
  if (!dose) throw new Error("Dose não encontrada.");
  if (dose.taken_at) return dose;
  const date = dose.daily_schedules.date as string;
  const timezone = "America/Sao_Paulo";
  const takenMinute = parseClock(takenTime);
  const scheduledMinute = dose.scheduled_local ? parseClock(String(dose.scheduled_local).slice(0, 5)) : null;
  const status = scheduledMinute === null ? "requires_review" : takenMinute === scheduledMinute ? "taken_on_time" : takenMinute < scheduledMinute ? "taken_early" : "taken_late";
  const takenAt = zonedMinuteToIso(date, takenMinute, timezone);
  const { data: updated, error } = await supabase.from("scheduled_doses").update({ status, taken_at: takenAt }).eq("id", doseId).select().single();
  if (error) throw error;
  await cancelQueuedNotifications(supabase, doseId);
  await updateSnapshotDose(supabase, dose.daily_schedule_id, dose.client_key, { status, takenMinute });
  await supabase.from("schedule_events").insert({ daily_schedule_id: dose.daily_schedule_id, event_type: "dose_taken", payload_json: { doseId, scheduledAt: dose.scheduled_at, takenAt, status, futureDosesMoved: false, reason: "reschedule_policy_unconfirmed" } });
  return updated;
}

export async function updateSnapshotDose(
  supabase: SupabaseClient,
  scheduleId: string,
  clientKey: string,
  changes: Record<string, unknown>,
) {
  const { data, error } = await supabase.from("daily_schedules").select("snapshot_json").eq("id", scheduleId).single();
  if (error) throw error;
  const snapshot = data.snapshot_json as { doses?: Array<Record<string, unknown>> };
  snapshot.doses = (snapshot.doses ?? []).map((dose) => dose.id === clientKey ? { ...dose, ...changes } : dose);
  const { error: updateError } = await supabase.from("daily_schedules").update({ snapshot_json: snapshot }).eq("id", scheduleId);
  if (updateError) throw updateError;
}
