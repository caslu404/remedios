import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { ownedDose, updateSnapshotDose } from "@/lib/server/doses";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  try {
    const { id } = await params;
    const dose = await ownedDose(context.supabase, context.user.id, id);
    if (!dose) return NextResponse.json({ error: "Dose não encontrada." }, { status: 404 });
    const sendAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await context.supabase.from("scheduled_doses").update({ status: "snoozed" }).eq("id", id);
    await updateSnapshotDose(context.supabase, dose.daily_schedule_id, dose.client_key, { status: "snoozed" });
    await context.supabase.from("notification_jobs").insert({ user_id: context.user.id, scheduled_dose_id: id, send_at: sendAt, type: "snooze", payload_json: { title: "Lembrete adiado", body: dose.notes, url: `/?dose=${id}` } });
    await context.supabase.from("schedule_events").insert({ daily_schedule_id: dose.daily_schedule_id, event_type: "dose_snoozed", payload_json: { doseId: id, minutes: 10, scheduleChanged: false } });
    return NextResponse.json({ ok: true, sendAt, scheduleChanged: false });
  } catch (error) {
    return serverError("Não foi possível adiar o lembrete.", error);
  }
}
