import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { latestSchedule } from "@/lib/server/schedules";
import { todayInTimeZone } from "@/lib/time/today";

export async function GET() {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const { data, error } = await latestSchedule(context.supabase, context.user.id, todayInTimeZone());
  if (error) return serverError("Não foi possível carregar o cronograma.", error);
  return NextResponse.json({ schedule: data?.snapshot_json ?? null, id: data?.id ?? null, status: data?.status ?? null });
}
