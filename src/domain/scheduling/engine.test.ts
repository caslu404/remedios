import { describe, expect, it } from "vitest";
import {
  INITIAL_TREATMENT_PHASES,
  detectConflicts,
  generateDailySchedule,
  recalculateAfterDoseTaken,
  validateSchedule,
} from "./index";
import type { GenerateScheduleInput, MedicationPhase } from "./types";

function input(overrides: Partial<GenerateScheduleInput> = {}): GenerateScheduleInput {
  return {
    date: "2026-08-06",
    timezone: "America/Sao_Paulo",
    wakeTime: "06:20",
    plannedBedtime: "23:30",
    breakfastWindow: { start: "07:00", end: "08:30" },
    dinnerWindow: { start: "18:30", end: "20:30" },
    phases: INITIAL_TREATMENT_PHASES,
    now: "2026-08-06T09:20:00.000Z",
    ...overrides,
  };
}

describe("generateDailySchedule", () => {
  it("monta o primeiro dia com a rotina padrão de 06:30 a 22:30", () => {
    const schedule = generateDailySchedule(input({ wakeTime: "06:30", plannedBedtime: "22:30" }));
    expect(schedule.date).toBe("2026-08-06");
    expect(schedule.doses).toHaveLength(11);
    expect(schedule.doses.filter((dose) => dose.scheduledAtLocal !== null).every((dose) => dose.scheduledAtLocal?.startsWith("2026-08-06T"))).toBe(true);
    expect(schedule.doses.filter((dose) => dose.medicationId === "metronidazol").map((dose) => dose.scheduledMinute)).toEqual([390, 870, 1350]);
  });

  it.each(["05:30", "06:00", "06:30", "07:00", "07:45", "09:00", "11:00"])(
    "gera todas as doses prescritas para despertar às %s sem duplicar",
    (wakeTime) => {
      const schedule = generateDailySchedule(input({ wakeTime }));
      expect(schedule.doses).toHaveLength(11);
      expect(new Set(schedule.doses.map((dose) => `${dose.phaseId}:${dose.sequenceNumber}`)).size).toBe(11);
    },
  );

  it("reproduz os horários-alvo do exemplo sem inferir tolerâncias", () => {
    const schedule = generateDailySchedule(input());
    const times = Object.fromEntries(
      schedule.doses.map((dose) => [`${dose.medicationId}-${dose.sequenceNumber}`, dose.scheduledMinute]),
    );
    expect(times).toMatchObject({
      "nexium-1": 380,
      "nac-1": 380,
      "rifaximina-1": 420,
      "metronidazol-1": 380,
      "metronidazol-2": 860,
      "nac-2": 1110,
      "rifaximina-2": 1140,
      "metronidazol-3": 1340,
    });
    expect(INITIAL_TREATMENT_PHASES.find((phase) => phase.medicationId === "metronidazol")?.interval.minimumMinutes).toBeNull();
  });

  it("respeita as mudanças de fase e as datas inclusivas", () => {
    const day14 = generateDailySchedule(input({ date: "2026-08-19" }));
    const day15 = generateDailySchedule(input({ date: "2026-08-20" }));
    const day16 = generateDailySchedule(input({ date: "2026-08-21" }));
    const day30 = generateDailySchedule(input({ date: "2026-09-04" }));
    const afterTreatment = generateDailySchedule(input({ date: "2026-10-05" }));

    expect(day14.doses.filter((dose) => dose.medicationId === "rifaximina")).toHaveLength(2);
    expect(day15.doses.filter((dose) => dose.medicationId === "rifaximina")).toHaveLength(0);
    expect(day15.doses.filter((dose) => dose.medicationId === "berberina-caprilico")).toHaveLength(2);
    expect(day16.doses.filter((dose) => dose.medicationId === "berberina-caprilico")).toHaveLength(1);
    expect(day30.doses.filter((dose) => dose.medicationId === "oleo-oregano")).toHaveLength(1);
    expect(afterTreatment.doses.map((dose) => dose.medicationId)).toEqual(["nexium"]);
  });

  it("não cria conflito de Nexium antes do início do tratamento", () => {
    const schedule = generateDailySchedule(input({ date: "2026-08-05", wakeTime: "14:00" }));
    expect(schedule.doses).toHaveLength(0);
    expect(schedule.conflicts).toHaveLength(0);
    expect(schedule.status).toBe("draft");
  });

  it("não inventa antecedência do óleo de orégano quando o NAC noturno não está ativo", () => {
    const schedule = generateDailySchedule(input({ date: "2026-08-25" }));
    const oregano = schedule.doses.find((dose) => dose.medicationId === "oleo-oregano");
    expect(oregano?.scheduledMinute).toBeNull();
    expect(oregano?.status).toBe("requires_review");
    expect(schedule.conflicts.some((item) => item.code === "OREGANO_LEAD_TIME_UNCONFIRMED")).toBe(true);
  });

  it("mantém uma dose tardia visível e alerta sobre o sono", () => {
    const schedule = generateDailySchedule(input({ wakeTime: "11:00", plannedBedtime: "23:00" }));
    expect(schedule.conflicts.some((item) => item.code === "DOSE_AT_OR_AFTER_BEDTIME")).toBe(true);
    expect(schedule.doses.filter((dose) => dose.medicationId === "metronidazol")).toHaveLength(3);
  });
});

describe("validateSchedule e detectConflicts", () => {
  it("detecta dose duplicada e frequência acima da prescrita", () => {
    const schedule = generateDailySchedule(input());
    schedule.doses.push({ ...schedule.doses[0]! });
    const conflicts = detectConflicts(schedule, INITIAL_TREATMENT_PHASES);
    expect(conflicts.some((item) => item.code === "DUPLICATE_DOSE")).toBe(true);
    expect(validateSchedule(schedule, INITIAL_TREATMENT_PHASES).valid).toBe(false);
  });

  it("aplica intervalo mínimo somente quando fornecido e confirmado", () => {
    const phases: MedicationPhase[] = structuredClone(INITIAL_TREATMENT_PHASES);
    const metro = phases.find((phase) => phase.medicationId === "metronidazol")!;
    metro.interval.minimumMinutes = 450;
    metro.interval.maximumMinutes = 510;
    metro.interval.source = "Validação de teste";
    metro.interval.confirmedAt = "2026-08-05T12:00:00Z";
    metro.interval.confirmedBy = "Profissional de teste";
    const schedule = generateDailySchedule(input({ phases }));
    const second = schedule.doses.find((dose) => dose.medicationId === "metronidazol" && dose.sequenceNumber === 2)!;
    second.scheduledMinute = schedule.doses.find((dose) => dose.medicationId === "metronidazol" && dose.sequenceNumber === 1)!.scheduledMinute! + 420;
    expect(detectConflicts(schedule, phases).some((item) => item.code === "BELOW_MINIMUM_INTERVAL")).toBe(true);
  });
});

describe("recalculateAfterDoseTaken", () => {
  it("registra o horário real, mas não move doses sem política validada", () => {
    const schedule = generateDailySchedule(input());
    const second = schedule.doses.find((dose) => dose.medicationId === "metronidazol" && dose.sequenceNumber === 2)!;
    const thirdBefore = schedule.doses.find((dose) => dose.medicationId === "metronidazol" && dose.sequenceNumber === 3)!.scheduledMinute;
    const updated = recalculateAfterDoseTaken(
      { doseId: second.id, takenTime: "15:42", occurredAt: "2026-08-06T18:42:00Z" },
      schedule,
      INITIAL_TREATMENT_PHASES,
    );
    expect(updated.doses.find((dose) => dose.id === second.id)?.status).toBe("taken_late");
    expect(updated.doses.find((dose) => dose.medicationId === "metronidazol" && dose.sequenceNumber === 3)?.scheduledMinute).toBe(thirdBefore);
    expect(updated.conflicts.some((item) => item.code === "RESCHEDULE_POLICY_UNCONFIRMED")).toBe(true);
  });

  it("move doses futuras no intervalo-alvo somente com política explicitamente confirmada", () => {
    const phases: MedicationPhase[] = structuredClone(INITIAL_TREATMENT_PHASES);
    const metro = phases.find((phase) => phase.medicationId === "metronidazol")!;
    metro.reschedulePolicy = { moveFutureDoses: true, confirmed: true, source: "Validação de teste" };
    metro.interval.minimumMinutes = 450;
    metro.interval.maximumMinutes = 510;
    const schedule = generateDailySchedule(input({ phases }));
    const second = schedule.doses.find((dose) => dose.medicationId === "metronidazol" && dose.sequenceNumber === 2)!;
    const updated = recalculateAfterDoseTaken({ doseId: second.id, takenTime: "15:42" }, schedule, phases);
    expect(updated.doses.find((dose) => dose.medicationId === "metronidazol" && dose.sequenceNumber === 3)?.scheduledMinute).toBe(1422);
  });

  it("é idempotente para clique duplicado", () => {
    const schedule = generateDailySchedule(input());
    const dose = schedule.doses.find((item) => item.medicationId === "rifaximina")!;
    const once = recalculateAfterDoseTaken({ doseId: dose.id, takenTime: "07:05" }, schedule, INITIAL_TREATMENT_PHASES);
    const twice = recalculateAfterDoseTaken({ doseId: dose.id, takenTime: "07:06" }, once, INITIAL_TREATMENT_PHASES);
    expect(twice).toEqual(once);
  });
});
