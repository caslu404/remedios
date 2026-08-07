import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { cancelQueuedNotifications, ownedDose, updateSnapshotDose } from "@/lib/server/doses";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  try {
    const { id } = await params;
    const dose = await ownedDose(context.supabase, context.user.id, id);
    if (!dose) return NextResponse.json({ error: "Dose não encontrada." }, { status: 404 });
    const { error } = await context.supabase.from("scheduled_doses").update({ status: "skipped" }).eq("id", id);
    if (error) throw error;
    await cancelQueuedNotifications(context.supabase, id);
    await updateSnapshotDose(context.supabase, dose.daily_schedule_id, dose.client_key, { status: "skipped" });
    await context.supabase.from("schedule_events").insert({ daily_schedule_id: dose.daily_schedule_id, event_type: "dose_skipped", payload_json: { doseId: id, compensationCreated: false } });
    return NextResponse.json({ ok: true, compensationCreated: false });
  } catch (error) {
    return serverError("Não foi possível registrar a dose não tomada.", error);
  }
}
