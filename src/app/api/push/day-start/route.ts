import { NextResponse } from "next/server";
import { z } from "zod";
import { nextDailyReminderIso } from "@/lib/push/day-start";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { clockSchema } from "@/lib/server/schemas";

const schema = z.object({ enabled: z.boolean(), time: clockSchema });

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Preferência de horário inválida." }, { status: 400 });

  try {
    await context.supabase
      .from("notification_jobs")
      .update({ status: "cancelled" })
      .eq("user_id", context.user.id)
      .eq("type", "day_start")
      .eq("status", "queued");

    if (!parsed.data.enabled) return NextResponse.json({ enabled: false, scheduledAt: null });

    const { count } = await context.supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.user.id)
      .eq("active", true);
    if (!count) return NextResponse.json({ enabled: true, scheduledAt: null, reason: "no_active_device" });

    const timeZone = "America/Sao_Paulo";
    const scheduledAt = nextDailyReminderIso(parsed.data.time, timeZone);
    const { error } = await context.supabase.from("notification_jobs").insert({
      user_id: context.user.id,
      scheduled_dose_id: null,
      send_at: scheduledAt,
      type: "day_start",
      payload_json: {
        title: "Bom dia, Lucas!",
        body: "Vamos iniciar seu dia e montar os horários do tratamento?",
        url: "/?action=wake",
        tag: "day-start",
        recurrence: { time: parsed.data.time, timeZone },
      },
    });
    if (error) throw error;
    return NextResponse.json({ enabled: true, scheduledAt });
  } catch (cause) {
    return serverError("Não foi possível programar o lembrete diário.", cause);
  }
}
