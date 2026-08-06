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

  const { data: latest, error: latestError } = await supabase.from("daily_schedules").select("id,version").eq("user_id", userId).eq("date", input.date).order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
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
  if (latest?.id) {
    const { data: previousDoses, error: previousDoseError } = await supabase.from("scheduled_doses").select("id").eq("daily_schedule_id", latest.id);
    if (previousDoseError) throw previousDoseError;
    const previousDoseIds = (previousDoses ?? []).map((dose) => dose.id);
    if (previousDoseIds.length) {
      const { error: cancellationError } = await supabase.from("notification_jobs").update({ status: "cancelled" }).in("scheduled_dose_id", previousDoseIds).eq("status", "queued");
      if (cancellationError) throw cancellationError;
    }
  }
  await supabase.from("schedule_events").insert({ daily_schedule_id: row.id, client_event_id: clientEventId ?? null, event_type: "schedule_generated", payload_json: { reason: schedule.generationReason, conflicts: schedule.conflicts.map((item) => item.code) } });
  return { id: row.id as string, schedule };
}

export async function latestSchedule(supabase: SupabaseClient, userId: string, date: string) {
  return supabase.from("daily_schedules").select("id,status,snapshot_json,version,confirmed_at").eq("user_id", userId).eq("date", date).order("version", { ascending: false }).limit(1).maybeSingle();
}

interface NotificationDoseRow {
  id: string;
  client_key: string;
  scheduled_at: string;
  scheduled_local: string;
  notes: string | null;
  quantity: number | string;
  medication_phases: {
    dose_unit: string;
    medications: { display_name: string };
  };
}

function displayQuantity(value: number | string): string {
  const quantity = Number(value);
  return Number.isInteger(quantity) ? String(quantity) : String(value);
}

function notificationDoseLabel(dose: NotificationDoseRow): string {
  return `${dose.medication_phases.medications.display_name} — ${displayQuantity(dose.quantity)} ${dose.medication_phases.dose_unit}`;
}

export async function confirmSchedule(supabase: SupabaseClient, userId: string, date: string, clientEventId?: string) {
  const { data: latest, error } = await latestSchedule(supabase, userId, date);
  if (error || !latest) throw error ?? new Error("Cronograma não encontrado.");
  const now = new Date().toISOString();
  const confirmedStatus = latest.status === "requires_review" ? "requires_review" : "confirmed";
  const snapshot = { ...(latest.snapshot_json as object), status: confirmedStatus, confirmedAt: now };
  await supabase.from("daily_schedules").update({ status: confirmedStatus, confirmed_at: now, snapshot_json: snapshot }).eq("id", latest.id);
  await supabase.from("daily_checkins").update({ confirmed_at: now }).eq("user_id", userId).eq("date", date);
  await supabase.from("schedule_events").upsert({ daily_schedule_id: latest.id, client_event_id: clientEventId ?? null, event_type: "schedule_confirmed", payload_json: {} }, { onConflict: "daily_schedule_id,client_event_id", ignoreDuplicates: true });
  const { data: doses } = await supabase
    .from("scheduled_doses")
    .select("id,client_key,scheduled_at,scheduled_local,notes,quantity,medication_phases!inner(dose_unit,medications!inner(display_name))")
    .eq("daily_schedule_id", latest.id)
    .not("scheduled_at", "is", null)
    .in("status", ["planned", "snoozed"]);
  const notificationDoses = (doses ?? []) as unknown as NotificationDoseRow[];
  const doseIds = notificationDoses.map((dose) => dose.id);
  if (doseIds.length) {
    await supabase.from("notification_jobs").update({ status: "cancelled" }).in("scheduled_dose_id", doseIds).eq("status", "queued");
  }
  const { data: checkin } = await supabase.from("daily_checkins").select("breakfast_window,dinner_window").eq("user_id", userId).eq("date", date).maybeSingle();
  const schedule = latest.snapshot_json as DailySchedule;
  const groups = new Map<string, NotificationDoseRow[]>();
  for (const dose of notificationDoses) {
    const key = dose.scheduled_at;
    groups.set(key, [...(groups.get(key) ?? []), dose]);
  }
  const current = Date.now();
  const jobs = [...groups.values()].flatMap((group) => {
    const first = group[0]!;
    const scheduled = new Date(first.scheduled_at).getTime();
    const localTime = String(first.scheduled_local).slice(0, 5);
    const scheduledMinute = Number(localTime.slice(0, 2)) * 60 + Number(localTime.slice(3, 5));
    const meal = schedule.meals.find((item) => item.scheduledMinute === scheduledMinute);
    const windowValue = meal?.id === "breakfast" ? checkin?.breakfast_window : meal?.id === "dinner" ? checkin?.dinner_window : null;
    const windowEnd = typeof windowValue === "object" && windowValue && "end" in windowValue ? String(windowValue.end) : null;
    const labels = group.map(notificationDoseLabel);
    const list = labels.join(" + ");
    const url = group.length === 1 ? `/?dose=${first.client_key}` : `/?at=${localTime}`;
    const commonPayload = {
      body: meal && windowEnd ? `Janela planejada até ${windowEnd}. ${list}.` : `${list}. Toque para abrir e registrar.`,
      url,
      recordId: group.length === 1 ? first.id : null,
      tag: `treatment-${date}-${localTime}`,
    };
    const mainTitle = meal ? `Hora do ${meal.label.toLowerCase()}` : group.length > 1 ? `Hora de ${group.length} medicamentos` : `Hora de tomar ${first.medication_phases.medications.display_name}`;
    const preTitle = meal ? `${meal.label} em 10 minutos` : group.length > 1 ? `${group.length} medicamentos em 10 minutos` : `${first.medication_phases.medications.display_name} em 10 minutos`;
    return [
      { user_id: userId, scheduled_dose_id: first.id, send_at: new Date(scheduled - 10 * 60_000).toISOString(), type: "pre_reminder", payload_json: { ...commonPayload, title: preTitle, tag: `${commonPayload.tag}-pre` } },
      { user_id: userId, scheduled_dose_id: first.id, send_at: new Date(scheduled).toISOString(), type: "main_reminder", payload_json: { ...commonPayload, title: mainTitle } },
    ].filter((job) => new Date(job.send_at).getTime() > current);
  });
  if (jobs.length) await supabase.from("notification_jobs").upsert(jobs, { onConflict: "scheduled_dose_id,type,send_at", ignoreDuplicates: true });
  return latest;
}

export function scheduleFromRow(value: unknown): DailySchedule {
  return value as DailySchedule;
}
