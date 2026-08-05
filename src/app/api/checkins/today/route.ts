import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { todayInTimeZone } from "@/lib/time/today";

export async function GET() {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const { data, error } = await context.supabase.from("daily_checkins").select("*").eq("user_id", context.user.id).eq("date", todayInTimeZone()).maybeSingle();
  if (error) return serverError("Não foi possível carregar o check-in.", error);
  return NextResponse.json({ checkin: data });
}
