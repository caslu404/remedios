import type { SupabaseClient } from "@supabase/supabase-js";
import { INITIAL_TREATMENT_PHASES, type MedicationPhase } from "@/domain/scheduling";

const MEDICATION_DETAILS: Record<string, { fullName: string; strength: string; unit: string; form: string; notes?: string }> = {
  nexium: { fullName: "Nexium / esomeprazol", strength: "40 mg", unit: "comprimido", form: "comprimido" },
  nac: { fullName: "N-acetilcisteína", strength: "600 mg", unit: "unidade", form: "unidade" },
  rifaximina: { fullName: "Rifaximina", strength: "550 mg", unit: "comprimido", form: "comprimido" },
  metronidazol: { fullName: "Metronidazol", strength: "250 mg", unit: "comprimido", form: "comprimido", notes: "Não consumir álcool durante o tratamento e por pelo menos três dias após a última dose." },
  berberina_caprilico: { fullName: "Berberina + ácido caprílico", strength: "Manipulado", unit: "cápsulas", form: "cápsula" },
  "oleo-oregano": { fullName: "Óleo de orégano", strength: "250 mg", unit: "cápsula", form: "cápsula" },
};

function rescheduleRuleTimestamps(phase: MedicationPhase): { confirmed_at: string | null; confirmed_by: string | null } {
  if (!phase.reschedulePolicy.confirmed) return { confirmed_at: null, confirmed_by: null };
  return { confirmed_at: phase.reschedulePolicy.confirmedAt, confirmed_by: phase.reschedulePolicy.confirmedBy };
}

async function reconcilePhaseRules(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: phaseRows, error } = await supabase.from("medication_phases").select("id,client_key,medications!inner(treatments!inner(user_id))").eq("medications.treatments.user_id", userId);
  if (error) throw error;
  const phaseIdByKey = new Map((phaseRows ?? []).map((row) => [row.client_key, row.id as string]));
  for (const phase of INITIAL_TREATMENT_PHASES) {
    const phaseId = phaseIdByKey.get(phase.id);
    if (!phaseId) continue;
    const { error: phaseUpdateError } = await supabase.from("medication_phases").update({
      target_interval_minutes: phase.interval.targetMinutes,
      minimum_interval_minutes: phase.interval.minimumMinutes,
      maximum_interval_minutes: phase.interval.maximumMinutes,
    }).eq("id", phaseId);
    if (phaseUpdateError) throw phaseUpdateError;
    const { error: intervalRuleError } = await supabase.from("medication_rules").upsert({
      medication_phase_id: phaseId,
      rule_type: "interval",
      rule_config_json: phase.interval,
      is_hard_constraint: true,
      source: phase.interval.source,
      confirmed_at: phase.interval.confirmedAt,
      confirmed_by: phase.interval.confirmedBy,
    }, { onConflict: "medication_phase_id,rule_type" });
    if (intervalRuleError) throw intervalRuleError;
    const rescheduleTimestamps = rescheduleRuleTimestamps(phase);
    const { error: rescheduleRuleError } = await supabase.from("medication_rules").upsert({
      medication_phase_id: phaseId,
      rule_type: "reschedule_policy",
      rule_config_json: phase.reschedulePolicy,
      is_hard_constraint: true,
      source: phase.reschedulePolicy.source,
      confirmed_at: rescheduleTimestamps.confirmed_at,
      confirmed_by: rescheduleTimestamps.confirmed_by,
    }, { onConflict: "medication_phase_id,rule_type" });
    if (rescheduleRuleError) throw rescheduleRuleError;
  }
}

export async function ensureInitialTreatment(supabase: SupabaseClient, userId: string): Promise<MedicationPhase[]> {
  const { data: existing } = await supabase.from("treatments").select("id").eq("user_id", userId).eq("name", "Tratamento Adaptativo do Lucas").maybeSingle();
  if (existing) {
    await reconcilePhaseRules(supabase, userId);
    return loadTreatmentPhases(supabase, userId);
  }

  const { data: treatment, error: treatmentError } = await supabase.from("treatments").insert({
    user_id: userId,
    name: "Tratamento Adaptativo do Lucas",
    start_date: "2026-08-06",
    end_date: null,
    status: "active",
    medical_notes: "Organizador de rotina; não altera a prescrição.",
  }).select("id").single();
  if (treatmentError) throw treatmentError;

  const groups = new Map<string, MedicationPhase[]>();
  for (const phase of INITIAL_TREATMENT_PHASES) {
    const values = groups.get(phase.medicationId) ?? [];
    values.push(phase);
    groups.set(phase.medicationId, values);
  }

  for (const [slug, phases] of groups) {
    const first = phases[0]!;
    const details = MEDICATION_DETAILS[slug] ?? MEDICATION_DETAILS[slug.replace("-", "_")]!;
    const { data: medication, error } = await supabase.from("medications").insert({
      treatment_id: treatment.id,
      slug,
      display_name: first.medicationName,
      full_name: details.fullName,
      strength: details.strength,
      unit: details.unit,
      form: details.form,
      notes: details.notes ?? null,
      continuous: Boolean(first.continuous),
    }).select("id").single();
    if (error) throw error;

    for (const phase of phases) {
      const { data: insertedPhase, error: phaseError } = await supabase.from("medication_phases").insert({
        medication_id: medication.id,
        client_key: phase.id,
        phase_name: phase.phaseName,
        start_date: phase.startDate,
        end_date: phase.endDate,
        dose_quantity: phase.doseQuantity,
        dose_unit: phase.doseUnit,
        doses_per_day: phase.dosesPerDay,
        target_interval_minutes: phase.interval.targetMinutes,
        minimum_interval_minutes: phase.interval.minimumMinutes,
        maximum_interval_minutes: phase.interval.maximumMinutes,
        rigidity: phase.rigidity,
        slot_strategy: phase.slotStrategy,
      }).select("id").single();
      if (phaseError) throw phaseError;
      const rules: Array<{
        rule_type: string;
        rule_config_json: object;
        is_hard_constraint: boolean;
        source: string | null;
        confirmed_at: string | null;
        confirmed_by: string | null;
      }> = [
        { rule_type: "interval", rule_config_json: phase.interval, is_hard_constraint: true, source: phase.interval.source, confirmed_at: phase.interval.confirmedAt, confirmed_by: phase.interval.confirmedBy },
        { rule_type: "reschedule_policy", rule_config_json: phase.reschedulePolicy, is_hard_constraint: true, source: phase.reschedulePolicy.source, ...rescheduleRuleTimestamps(phase) },
      ];
      if (phase.dependency) rules.push({ rule_type: "dependency", rule_config_json: phase.dependency, is_hard_constraint: true, source: phase.dependency.source, confirmed_at: phase.dependency.confirmed ? "2026-08-05T00:00:00Z" : null, confirmed_by: null });
      const { error: rulesError } = await supabase.from("medication_rules").insert(rules.map((rule) => ({ ...rule, medication_phase_id: insertedPhase.id })));
      if (rulesError) throw rulesError;
    }
  }
  return loadTreatmentPhases(supabase, userId);
}

export async function loadTreatmentPhases(supabase: SupabaseClient, userId: string): Promise<MedicationPhase[]> {
  const { data, error } = await supabase
    .from("medication_phases")
    .select("*,medications!inner(slug,display_name,continuous,treatments!inner(user_id)),medication_rules(rule_type,rule_config_json,source,confirmed_at,confirmed_by)")
    .eq("medications.treatments.user_id", userId)
    .order("start_date");
  if (error) throw error;
  const groupingByPhaseId = new Map(INITIAL_TREATMENT_PHASES.map((phase) => [phase.id, phase.morningGroupingWithNexium]));
  return (data ?? []).map((row) => {
    const medication = row.medications as unknown as { slug: string; display_name: string; continuous: boolean };
    const rules = row.medication_rules as Array<{ rule_type: string; rule_config_json: Record<string, unknown>; source: string | null; confirmed_at: string | null; confirmed_by: string | null }>;
    const intervalRule = rules.find((rule) => rule.rule_type === "interval");
    const dependencyRule = rules.find((rule) => rule.rule_type === "dependency");
    const rescheduleRule = rules.find((rule) => rule.rule_type === "reschedule_policy");
    return {
      id: row.client_key,
      medicationId: medication.slug,
      medicationName: medication.display_name,
      phaseName: row.phase_name,
      startDate: row.start_date,
      endDate: row.end_date,
      doseQuantity: Number(row.dose_quantity),
      doseUnit: row.dose_unit,
      dosesPerDay: row.doses_per_day,
      interval: {
        targetMinutes: row.target_interval_minutes,
        minimumMinutes: row.minimum_interval_minutes,
        maximumMinutes: row.maximum_interval_minutes,
        source: intervalRule?.source ?? null,
        confirmedAt: intervalRule?.confirmed_at ?? null,
        confirmedBy: intervalRule?.confirmed_by ?? null,
        notes: typeof intervalRule?.rule_config_json.notes === "string" ? intervalRule.rule_config_json.notes : null,
      },
      rigidity: row.rigidity,
      continuous: medication.continuous,
      slotStrategy: row.slot_strategy,
      dependency: dependencyRule ? dependencyRule.rule_config_json as unknown as MedicationPhase["dependency"] : undefined,
      morningGroupingWithNexium: groupingByPhaseId.get(row.client_key),
      reschedulePolicy: {
        moveFutureDoses: typeof rescheduleRule?.rule_config_json.moveFutureDoses === "boolean" ? rescheduleRule.rule_config_json.moveFutureDoses : null,
        confirmed: Boolean(rescheduleRule?.confirmed_at),
        source: rescheduleRule?.source ?? null,
        confirmedAt: rescheduleRule?.confirmed_at ?? null,
        confirmedBy: rescheduleRule?.confirmed_by ?? null,
      },
    } as MedicationPhase;
  });
}
