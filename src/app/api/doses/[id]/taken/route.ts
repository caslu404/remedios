import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { takenSchema } from "@/lib/server/schemas";
import { markDoseTaken } from "@/lib/server/doses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const parsed = takenSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Horário real inválido." }, { status: 400 });
  try {
    const { id } = await params;
    return NextResponse.json({ dose: await markDoseTaken(context.supabase, context.user.id, id, parsed.data.takenTime), futureDosesMoved: false });
  } catch (error) {
    return serverError("Não foi possível registrar a dose.", error);
  }
}
