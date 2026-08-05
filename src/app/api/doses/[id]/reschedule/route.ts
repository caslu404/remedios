import { NextResponse } from "next/server";
import { authenticatedContext, unauthorized } from "@/lib/server/auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  await params;
  return NextResponse.json({
    error: "Reagendamento manual bloqueado: a política de tolerância ainda não foi validada.",
    code: "RESCHEDULE_POLICY_UNCONFIRMED",
  }, { status: 409 });
}
