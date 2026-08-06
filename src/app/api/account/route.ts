import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedContext, unauthorized } from "@/lib/server/auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export async function DELETE(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const parsed = z.object({ confirmation: z.literal("APAGAR CONTA") }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirmação obrigatória." }, { status: 400 });
  if (!(await withinRateLimit(context.supabase, "account_delete", 1, 3600))) return NextResponse.json({ error: "Operação temporariamente limitada." }, { status: 429 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Exclusão não configurada no servidor." }, { status: 503 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(context.user.id);
  if (error) return NextResponse.json({ error: "Não foi possível apagar a conta." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
