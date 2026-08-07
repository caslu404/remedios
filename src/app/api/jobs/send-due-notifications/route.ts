import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { nextDailyReminderIso } from "@/lib/push/day-start";
import { webPushClient } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_AFTER_MS = 60 * 60_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Backend não configurado." }, { status: 503 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  async function scheduleNextDayStart(userId: string, payload: { recurrence?: { time?: string; timeZone?: string } }) {
    if (!payload.recurrence?.time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(payload.recurrence.time)) return;
    const timeZone = payload.recurrence.timeZone || "America/Sao_Paulo";
    const nextAt = nextDailyReminderIso(payload.recurrence.time, timeZone, new Date(Date.now() + 60_000));
    const { data: existing } = await admin.from("notification_jobs").select("id").eq("user_id", userId).eq("type", "day_start").eq("status", "queued").eq("send_at", nextAt).maybeSingle();
    if (!existing) {
      await admin.from("notification_jobs").insert({ user_id: userId, scheduled_dose_id: null, send_at: nextAt, type: "day_start", payload_json: payload });
    }
  }

  const { data: jobs, error } = await admin.from("notification_jobs").select("id,user_id,type,payload_json,attempt_count,send_at").eq("status", "queued").lte("send_at", new Date().toISOString()).order("send_at").limit(50);
  if (error) return NextResponse.json({ error: "Falha ao buscar fila." }, { status: 500 });
  let sent = 0;
  let failed = 0;
  let expired = 0;
  for (const job of jobs ?? []) {
    const payload = job.payload_json as { recurrence?: { time?: string; timeZone?: string } };
    if (Date.now() - new Date(job.send_at).getTime() > STALE_AFTER_MS) {
      const { data: claimed } = await admin.from("notification_jobs").update({ status: "cancelled", last_error: "expired_stale" }).eq("id", job.id).eq("status", "queued").select("id").maybeSingle();
      if (claimed) {
        expired += 1;
        if (job.type === "day_start") await scheduleNextDayStart(job.user_id, payload);
      }
      continue;
    }
    const { data: claimed } = await admin.from("notification_jobs").update({ status: "processing", attempt_count: job.attempt_count + 1 }).eq("id", job.id).eq("status", "queued").select("id").maybeSingle();
    if (!claimed) continue;
    const { data: subscriptions } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", job.user_id).eq("active", true);
    if (!subscriptions?.length) {
      await admin.from("notification_jobs").update({ status: "failed", last_error: "no_active_subscription" }).eq("id", job.id);
      failed += 1;
      continue;
    }
    let delivered = false;
    for (const subscription of subscriptions) {
      try {
        await webPushClient().sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(job.payload_json));
        await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", subscription.id);
        delivered = true;
      } catch (cause) {
        const statusCode = typeof cause === "object" && cause && "statusCode" in cause ? Number(cause.statusCode) : 0;
        await admin.from("push_subscriptions").update({ active: statusCode !== 404 && statusCode !== 410, last_failure_at: new Date().toISOString() }).eq("id", subscription.id);
      }
    }
    await admin.from("notification_jobs").update(delivered ? { status: "sent", sent_at: new Date().toISOString(), last_error: null } : { status: "failed", last_error: "delivery_failed" }).eq("id", job.id);
    if (job.type === "day_start") await scheduleNextDayStart(job.user_id, payload);
    if (delivered) sent += 1; else failed += 1;
  }
  return NextResponse.json({ processed: (jobs ?? []).length, sent, failed, expired, precision: "worker_every_minute_best_effort" });
}
