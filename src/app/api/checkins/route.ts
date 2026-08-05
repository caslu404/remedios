import { NextResponse } from "next/server";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";
import { scheduleInputSchema } from "@/lib/server/schemas";

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const parsed = scheduleInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check-in inválido.", issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const { data, error } = await context.supabase.from("daily_checkins").upsert({
    user_id: context.user.id,
    date: input.date,
    wake_time: `${input.wakeTime}:00`,
    planned_bedtime: `${input.plannedBedtime}:00`,
    breakfast_window: input.breakfastWindow,
    dinner_window: input.dinnerWindow,
    timezone: input.timezone,
  }, { onConflict: "user_id,date" }).select().single();
  if (error) return serverError("Não foi possível salvar o check-in.", error);
  return NextResponse.json({ checkin: data }, { status: 201 });
}
