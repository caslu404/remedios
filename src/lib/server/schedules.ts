import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailySchedule, GenerateScheduleInput } from "@/domain/scheduling";
import { generateDailySchedule } from "@/domain/scheduling";
import { minuteToClock, zonedMinuteToIso } from "@/lib/time/zoned";
import { ensureInitialTreatment } from "./treatment";

export async function createAndPersistSchedule(supabase: SupabaseClient, userId: string, input: Omit<GenerateScheduleInput, "phases">, clientEventId?: string) {
  const phases = await ensureInitialTreatment(supabase, userId);
  const schedule = generateDailySchedule({ ...input, phases });
  await supabase.from("daily_checkins").upsert({
    user_id: userId,
    date: input.date,
    wake_time: `${input.wakeTime}:00`,
    planned_bedtime: `${input.plannedBedtime}:00`,
    breakfast_window: input.breakfastWindow,
    dinner_window: input.dinnerWindow,
    timezone: input.timezone,
  }, { onConflict: "user_id,date" });

  const { data: latest } = await supabase.from("daily_schedules").select("version").eq("user_id", userId).eq("date", input.date).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (latest?.version ?? 0) + 1;
  schedule.version = version;
  const { data: row, error } = await supabase.from("daily_schedules").insert({
    user_id: userId,
    date: input.date,
    version,
    status: schedule.status,
    generated_at: schedule.generatedAt,
    generation_reason: schedule.generationReason,
    snapshot_json: schedule,
  }).select("id").single();
  if (error) throw error;

  const { data: phaseRows, error: phaseError } = await supabase.from("medication_phases").select("id,client_key,medications!inner(treatment_id,treatments!inner(user_id))").eq("medications.treatments.user_id", userId);
  if (phaseError) throw phaseError;
  const phaseMap = new Map((phaseRows ?? []).map((phase) => [phase.client_key, phase.id]));
  const inserts = schedule.doses.map((dose) => ({
    daily_schedule_id: row.id,
    medication_phase_id: phaseMap.get(dose.phaseId),
    client_key: dose.id,
    scheduled_at: dose.scheduledMinute === null ? null : zonedMinuteToIso(schedule.date, dose.scheduledMinute, schedule.timezone),
    scheduled_local: dose.scheduledMinute === null ? null : minuteToClock(dose.scheduledMinute),
    sequence_number: dose.sequenceNumber,
    status: dose.status,
    quantity: dose.quantity,
    notes: dose.instruction,
  }));
  if (inserts.some((item) => !item.medication_phase_id)) throw new Error("Fase persistida não encontrada.");
  const { error: doseError } = await supabase.from("scheduled_doses").insert(inserts);
  if (doseError) throw doseError;
  await supabase.from("schedule_events").insert({ daily_schedule_id: row.id, client_event_id: clientEventId ?? null, event_type: "schedule_generated", payload_json: { reason: schedule.generationReason, conflicts: schedule.conflicts.map((item) => item.code) } });
  return { id: row.id as string, schedule };
}

export async function latestSchedule(supabase: SupabaseClient, userId: string, date: string) {
  return supabase.from("daily_schedules").select("id,status,snapshot_json,version,confirmed_at").eq("user_id", userId).eq("date", date).order("version", { ascending: false }).limit(1).maybeSingle();
}

export async function confirmSchedule(supabase: SupabaseClient, userId: string, date: string, clientEventId?: string) {
  const { data: latest, error } = await latestSchedule(supabase, userId, date);
  if (error || !latest) throw error ?? new Error("Cronograma não encontrado.");
  const now = new Date().toISOString();
  const confirmedStatus = latest.status === "requires_review" ? "requires_review" : "confirmed";
  const snapshot = { ...(latest.snapshot_json as object), status: confirmedStatus };
  await supabase.from("daily_schedules").update({ status: confirmedStatus, confirmed_at: now, snapshot_json: snapshot }).eq("id", latest.id);
  await supabase.from("daily_checkins").update({ confirmed_at: now }).eq("user_id", userId).eq("date", date);
  await supabase.from("schedule_events").upsert({ daily_schedule_id: latest.id, client_event_id: clientEventId ?? null, event_type: "schedule_confirmed", payload_json: {} }, { onConflict: "daily_schedule_id,client_event_id", ignoreDuplicates: true });
  const { data: doses } = await supabase.from("scheduled_doses").select("id,scheduled_at,notes").eq("daily_schedule_id", latest.id).not("scheduled_at", "is", null).in("status", ["planned", "snoozed"]);
  const current = Date.now();
  const jobs = (doses ?? []).flatMap((dose) => {
    const scheduled = new Date(dose.scheduled_at).getTime();
    return [
      { user_id: userId, scheduled_dose_id: dose.id, send_at: new Date(scheduled - 10 * 60_000).toISOString(), type: "pre_reminder", payload_json: { title: "Medicamentos em 10 minutos", body: dose.notes, url: `/?dose=${dose.id}` } },
      { user_id: userId, scheduled_dose_id: dose.id, send_at: new Date(scheduled).toISOString(), type: "main_reminder", payload_json: { title: "Hora do seu tratamento", body: dose.notes, url: `/?dose=${dose.id}` } },
    ].filter((job) => new Date(job.send_at).getTime() > current);
  });
  if (jobs.length) await supabase.from("notification_jobs").upsert(jobs, { onConflict: "scheduled_dose_id,type,send_at", ignoreDuplicates: true });
  return latest;
}

export function scheduleFromRow(value: unknown): DailySchedule {
  return value as DailySchedule;
}
