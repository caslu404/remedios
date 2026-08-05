import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { clockSchema, dateSchema, scheduleInputSchema } from "@/lib/server/schemas";
import { confirmSchedule, createAndPersistSchedule, latestSchedule } from "@/lib/server/schedules";
import { markDoseTaken, updateSnapshotDose } from "@/lib/server/doses";
import { withinRateLimit } from "@/lib/server/rate-limit";

const eventSchema = z.object({ id: z.uuid(), type: z.enum(["day_started", "schedule_confirmed", "dose_taken", "dose_skipped", "dose_snoozed"]), payload: z.record(z.string(), z.unknown()), createdAt: z.iso.datetime() });

async function doseByClientKey(supabase: SupabaseClient, userId: string, date: string, clientKey: string) {
  const { data: schedule } = await latestSchedule(supabase, userId, date);
  if (!schedule) return null;
  const { data } = await supabase.from("scheduled_doses").select("id,daily_schedule_id,client_key,notes").eq("daily_schedule_id", schedule.id).eq("client_key", clientKey).maybeSingle();
  return data;
}

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  if (!(await withinRateLimit(context.supabase, "offline_sync", 20, 60))) return NextResponse.json({ error: "Sincronização temporariamente limitada." }, { status: 429 });
  const parsed = z.object({ events: z.array(eventSchema).max(200) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Fila offline inválida." }, { status: 400 });
  let applied = 0;
  const ignored: string[] = [];
  try {
    for (const item of parsed.data.events.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const { data: existing } = await context.supabase.from("schedule_events").select("id").eq("client_event_id", item.id).limit(1).maybeSingle();
      if (existing) { ignored.push(item.id); continue; }
      if (item.type === "day_started") {
        const preferences = z.object({ usualBedtime: clockSchema, breakfastStart: clockSchema, breakfastEnd: clockSchema, dinnerStart: clockSchema, dinnerEnd: clockSchema }).parse(item.payload.preferences);
        const input = scheduleInputSchema.parse({ date: item.payload.date, timezone: "America/Sao_Paulo", wakeTime: item.payload.wakeTime, plannedBedtime: preferences.usualBedtime, breakfastWindow: { start: preferences.breakfastStart, end: preferences.breakfastEnd }, dinnerWindow: { start: preferences.dinnerStart, end: preferences.dinnerEnd } });
        await createAndPersistSchedule(context.supabase, context.user.id, input, item.id);
      } else {
        const date = dateSchema.parse(item.payload.date);
        if (item.type === "schedule_confirmed") {
          await confirmSchedule(context.supabase, context.user.id, date, item.id);
        } else {
          const clientKey = z.string().min(1).parse(item.payload.doseClientId);
          const dose = await doseByClientKey(context.supabase, context.user.id, date, clientKey);
          if (!dose) { ignored.push(item.id); continue; }
          if (item.type === "dose_taken") {
            await markDoseTaken(context.supabase, context.user.id, dose.id, clockSchema.parse(item.payload.takenTime));
          } else if (item.type === "dose_skipped") {
            await context.supabase.from("scheduled_doses").update({ status: "skipped" }).eq("id", dose.id);
            await updateSnapshotDose(context.supabase, dose.daily_schedule_id, dose.client_key, { status: "skipped" });
          } else {
            await context.supabase.from("scheduled_doses").update({ status: "snoozed" }).eq("id", dose.id);
            await updateSnapshotDose(context.supabase, dose.daily_schedule_id, dose.client_key, { status: "snoozed" });
            await context.supabase.from("notification_jobs").insert({ user_id: context.user.id, scheduled_dose_id: dose.id, send_at: new Date(Date.now() + 10 * 60_000).toISOString(), type: "snooze", payload_json: { title: "Lembrete adiado", body: dose.notes, url: `/?dose=${dose.id}` } });
          }
          await context.supabase.from("schedule_events").insert({ daily_schedule_id: dose.daily_schedule_id, client_event_id: item.id, event_type: item.type, payload_json: { clientKey } });
        }
      }
      applied += 1;
    }
    return NextResponse.json({ applied, ignored });
  } catch (cause) {
    return serverError("Não foi possível sincronizar todos os registros offline.", cause);
  }
}
