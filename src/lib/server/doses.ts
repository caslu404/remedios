import type { SupabaseClient } from "@supabase/supabase-js";
import { minuteToClock, zonedMinuteToIso } from "@/lib/time/zoned";
import { parseClock, recalculateAfterDoseTaken } from "@/domain/scheduling";
import type { DailySchedule, DoseRecord } from "@/domain/scheduling";
import { loadTreatmentPhases } from "./treatment";

export async function ownedDose(supabase: SupabaseClient, userId: string, doseId: string) {
  const { data, error } = await supabase.from("scheduled_doses").select("*,daily_schedules!inner(id,user_id,date,confirmed_at)").eq("id", doseId).eq("daily_schedules.user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function cancelQueuedNotifications(supabase: SupabaseClient, doseId: string) {
  await supabase.from("notification_jobs").update({ status: "cancelled" }).eq("scheduled_dose_id", doseId).eq("status", "queued");
}

function notificationDoseLabel(dose: DoseRecord): string {
  const quantity = Number.isInteger(dose.quantity) ? String(dose.quantity) : String(dose.quantity);
  return `${dose.medicationName} — ${quantity} ${dose.doseUnit}`;
}

async function queueDoseNotifications(supabase: SupabaseClient, userId: string, scheduledDoseId: string, scheduledAtIso: string, dose: DoseRecord) {
  const scheduled = new Date(scheduledAtIso).getTime();
  const current = Date.now();
  const label = notificationDoseLabel(dose);
  const tag = `treatment-reschedule-${scheduledDoseId}`;
  const commonPayload = { body: `${label}. Horário ajustado após um registro anterior. Toque para abrir e registrar.`, url: `/?dose=${scheduledDoseId}`, recordId: scheduledDoseId, tag };
  const jobs = [
    { user_id: userId, scheduled_dose_id: scheduledDoseId, send_at: new Date(scheduled - 10 * 60_000).toISOString(), type: "pre_reminder", payload_json: { ...commonPayload, title: `${dose.medicationName} em 10 minutos`, tag: `${tag}-pre` } },
    { user_id: userId, scheduled_dose_id: scheduledDoseId, send_at: new Date(scheduled).toISOString(), type: "main_reminder", payload_json: { ...commonPayload, title: `Hora de tomar ${dose.medicationName}` } },
  ].filter((job) => new Date(job.send_at).getTime() > current);
  if (jobs.length) await supabase.from("notification_jobs").upsert(jobs, { onConflict: "scheduled_dose_id,type,send_at", ignoreDuplicates: true });
}

async function rescheduleFutureDoses(
  supabase: SupabaseClient,
  userId: string,
  scheduleId: string,
  takenClientKey: string,
  takenTime: string,
  scheduleConfirmed: boolean,
): Promise<string[]> {
  const { data: scheduleRow, error } = await supabase.from("daily_schedules").select("snapshot_json").eq("id", scheduleId).single();
  if (error) throw error;
  const snapshot = scheduleRow.snapshot_json as DailySchedule;
  const phases = await loadTreatmentPhases(supabase, userId);
  const recalculated = recalculateAfterDoseTaken({ doseId: takenClientKey, takenTime }, snapshot, phases);
  const moved = recalculated.doses.filter((candidate) => {
    if (candidate.id === takenClientKey) return false;
    const original = snapshot.doses.find((item) => item.id === candidate.id);
    return original !== undefined && (original.scheduledMinute !== candidate.scheduledMinute || original.status !== candidate.status);
  });
  if (!moved.length) return [];

  const { data: rows, error: rowsError } = await supabase.from("scheduled_doses").select("id,client_key").eq("daily_schedule_id", scheduleId).in("client_key", moved.map((dose) => dose.id));
  if (rowsError) throw rowsError;
  const idByClientKey = new Map((rows ?? []).map((row) => [row.client_key as string, row.id as string]));

  for (const dose of moved) {
    const scheduledDoseId = idByClientKey.get(dose.id);
    if (!scheduledDoseId) continue;
    const original = snapshot.doses.find((item) => item.id === dose.id)!;
    const timeChanged = original.scheduledMinute !== dose.scheduledMinute;
    const scheduledAt = dose.scheduledMinute === null ? null : zonedMinuteToIso(recalculated.date, dose.scheduledMinute, recalculated.timezone);
    const scheduledLocal = dose.scheduledMinute === null ? null : minuteToClock(dose.scheduledMinute);
    const updatePayload: Record<string, unknown> = { status: dose.status };
    if (timeChanged) {
      updatePayload.scheduled_at = scheduledAt;
      updatePayload.scheduled_local = scheduledLocal;
    }
    await supabase.from("scheduled_doses").update(updatePayload).eq("id", scheduledDoseId);
    await updateSnapshotDose(supabase, scheduleId, dose.id, { status: dose.status, scheduledMinute: dose.scheduledMinute, scheduledAtLocal: dose.scheduledAtLocal });
    if (timeChanged) {
      await cancelQueuedNotifications(supabase, scheduledDoseId);
      if (scheduleConfirmed && scheduledAt) await queueDoseNotifications(supabase, userId, scheduledDoseId, scheduledAt, dose);
    }
  }
  return moved.map((dose) => dose.id);
}

export async function markDoseTaken(supabase: SupabaseClient, userId: string, doseId: string, takenTime: string) {
  const dose = await ownedDose(supabase, userId, doseId);
  if (!dose) throw new Error("Dose não encontrada.");
  if (dose.taken_at) return { dose, futureDosesMoved: false };
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
  const movedDoseIds = await rescheduleFutureDoses(supabase, userId, dose.daily_schedule_id, dose.client_key, takenTime, dose.daily_schedules.confirmed_at !== null);
  await supabase.from("schedule_events").insert({ daily_schedule_id: dose.daily_schedule_id, event_type: "dose_taken", payload_json: { doseId, scheduledAt: dose.scheduled_at, takenAt, status, futureDosesMoved: movedDoseIds.length > 0 } });
  return { dose: updated, futureDosesMoved: movedDoseIds.length > 0 };
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
