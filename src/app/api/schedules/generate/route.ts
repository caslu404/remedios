import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { scheduleInputSchema } from "@/lib/server/schemas";
import { createAndPersistSchedule } from "@/lib/server/schedules";
import { withinRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  if (!(await withinRateLimit(context.supabase, "schedule_generate", 10, 60))) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
  const parsed = scheduleInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Entrada de cronograma inválida.", issues: parsed.error.issues }, { status: 400 });
  try {
    const result = await createAndPersistSchedule(context.supabase, context.user.id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return serverError("Não foi possível gerar o cronograma.", error);
  }
}
