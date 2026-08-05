import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { confirmSchedule } from "@/lib/server/schedules";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const { id } = await params;
  const { data, error } = await context.supabase.from("daily_schedules").select("date").eq("id", id).eq("user_id", context.user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Cronograma não encontrado." }, { status: 404 });
  try {
    await confirmSchedule(context.supabase, context.user.id, data.date);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError("Não foi possível confirmar o cronograma.", cause);
  }
}
