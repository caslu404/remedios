import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { webPushClient } from "@/lib/push/web-push";
import { withinRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  if (!(await withinRateLimit(context.supabase, "push_test", 5, 300))) return NextResponse.json({ error: "Limite de testes atingido." }, { status: 429 });
  const parsed = z.object({ kind: z.enum(["day_start", "medication"]).default("medication") }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Tipo de teste inválido." }, { status: 400 });
  const { data, error } = await context.supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", context.user.id).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Nenhum dispositivo ativo." }, { status: 404 });
  try {
    const payload = parsed.data.kind === "day_start"
      ? { title: "Bom dia, Lucas!", body: "Vamos iniciar seu dia e montar os horários do tratamento?", url: "/?action=wake", tag: "test-day-start" }
      : { title: "Exemplo: hora dos medicamentos", body: "Nexium 40 mg + NAC 600 mg. Toque para abrir o app e registrar.", url: "/", tag: "test-medication" };
    await webPushClient().sendNotification({ endpoint: data.endpoint, keys: { p256dh: data.p256dh, auth: data.auth } }, JSON.stringify(payload));
    await context.supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", data.id);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    await context.supabase.from("push_subscriptions").update({ last_failure_at: new Date().toISOString() }).eq("id", data.id);
    return serverError("Falha no teste de notificação.", cause);
  }
}
