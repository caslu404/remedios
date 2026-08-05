import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";

export async function GET() {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const [profile, treatments, schedules, events] = await Promise.all([
    context.supabase.from("users").select("id,email,name,timezone,usual_bedtime,created_at").eq("id", context.user.id).single(),
    context.supabase.from("treatments").select("*,medications(*,medication_phases(*,medication_rules(*)))").eq("user_id", context.user.id),
    context.supabase.from("daily_schedules").select("*,scheduled_doses(*)").eq("user_id", context.user.id).order("date"),
    context.supabase.from("schedule_events").select("*").order("created_at"),
  ]);
  const error = profile.error ?? treatments.error ?? schedules.error ?? events.error;
  if (error) return serverError("Não foi possível exportar os dados.", error);
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), profile: profile.data, treatments: treatments.data, schedules: schedules.data, events: events.data }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="tratamento-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" },
  });
}
