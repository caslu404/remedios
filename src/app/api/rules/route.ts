import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { ensureInitialTreatment } from "@/lib/server/treatment";

export async function GET() {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  try {
    return NextResponse.json({ phases: await ensureInitialTreatment(context.supabase, context.user.id) });
  } catch (error) {
    return serverError("Não foi possível carregar as regras.", error);
  }
}
