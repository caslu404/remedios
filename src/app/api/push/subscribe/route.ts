import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const parsed = subscriptionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Inscrição inválida." }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const { data, error } = await context.supabase.from("push_subscriptions").upsert({ user_id: context.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, device_label: "PWA", user_agent: request.headers.get("user-agent"), active: true }, { onConflict: "endpoint" }).select("id").single();
  if (error) return serverError("Não foi possível salvar o dispositivo.", error);
  return NextResponse.json({ subscriptionId: data.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "Endpoint obrigatório." }, { status: 400 });
  const { error } = await context.supabase.from("push_subscriptions").update({ active: false }).eq("user_id", context.user.id).eq("endpoint", endpoint);
  if (error) return serverError("Não foi possível desativar o dispositivo.", error);
  return NextResponse.json({ ok: true });
}
