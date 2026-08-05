import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";

export async function GET(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 60), 180);
  const { data, error } = await context.supabase.from("daily_schedules").select("id,date,version,status,confirmed_at,snapshot_json").eq("user_id", context.user.id).order("date", { ascending: false }).order("version", { ascending: false }).limit(limit);
  if (error) return serverError("Não foi possível carregar o histórico.", error);
  return NextResponse.json({ schedules: data });
}
