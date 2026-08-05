import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedContext, serverError, unauthorized } from "@/lib/server/auth";

const intervalUpdate = z.object({
  type: z.literal("interval"),
  targetMinutes: z.number().int().positive().nullable(),
  minimumMinutes: z.number().int().positive().nullable(),
  maximumMinutes: z.number().int().positive().nullable(),
  source: z.string().min(3),
  confirmedAt: z.iso.datetime(),
  confirmedBy: z.string().min(2),
  notes: z.string().max(1000).nullable().default(null),
}).refine((value) => value.minimumMinutes === null || value.maximumMinutes === null || value.minimumMinutes <= value.maximumMinutes, { message: "O mínimo não pode superar o máximo." });

const rescheduleUpdate = z.object({
  type: z.literal("reschedule_policy"),
  moveFutureDoses: z.boolean(),
  source: z.string().min(3),
  confirmedAt: z.iso.datetime(),
  confirmedBy: z.string().min(2),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedContext();
  if (!context) return unauthorized();
  const parsed = z.discriminatedUnion("type", [intervalUpdate, rescheduleUpdate]).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Regra inválida.", issues: parsed.error.issues }, { status: 400 });
  const { id } = await params;
  const { data: phase, error: lookupError } = await context.supabase.from("medication_phases").select("id,medications!inner(treatments!inner(user_id))").eq("id", id).eq("medications.treatments.user_id", context.user.id).maybeSingle();
  if (lookupError || !phase) return NextResponse.json({ error: "Fase não encontrada." }, { status: 404 });
  try {
    if (parsed.data.type === "interval") {
      const value = parsed.data;
      const { error } = await context.supabase.from("medication_phases").update({ target_interval_minutes: value.targetMinutes, minimum_interval_minutes: value.minimumMinutes, maximum_interval_minutes: value.maximumMinutes }).eq("id", id);
      if (error) throw error;
      await context.supabase.from("medication_rules").upsert({ medication_phase_id: id, rule_type: "interval", rule_config_json: { targetMinutes: value.targetMinutes, minimumMinutes: value.minimumMinutes, maximumMinutes: value.maximumMinutes, notes: value.notes }, is_hard_constraint: true, source: value.source, confirmed_at: value.confirmedAt, confirmed_by: value.confirmedBy }, { onConflict: "medication_phase_id,rule_type" });
    } else {
      const value = parsed.data;
      await context.supabase.from("medication_rules").upsert({ medication_phase_id: id, rule_type: "reschedule_policy", rule_config_json: { moveFutureDoses: value.moveFutureDoses, confirmed: true, source: value.source }, is_hard_constraint: true, source: value.source, confirmed_at: value.confirmedAt, confirmed_by: value.confirmedBy }, { onConflict: "medication_phase_id,rule_type" });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("Não foi possível atualizar a regra.", error);
  }
}
