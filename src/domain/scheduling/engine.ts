import {
  closestInWindow,
  formatClock,
  isIsoDate,
  localDateTime,
  parseClock,
  windowMinutes,
} from "./time";
import type {
  DailySchedule,
  DoseRecord,
  DoseTakenEvent,
  GenerateScheduleInput,
  MealRecord,
  MedicationPhase,
  ScheduleConflict,
  ValidationResult,
} from "./types";

function activeOn(phase: MedicationPhase, date: string): boolean {
  return phase.startDate <= date && (phase.endDate === null || date <= phase.endDate);
}

function conflict(
  code: string,
  message: string,
  doseIds: string[] = [],
  severity: ScheduleConflict["severity"] = "warning",
  requiresMedicalReview = false,
): ScheduleConflict {
  return { code, message, doseIds, severity, requiresMedicalReview };
}

function instructionFor(phase: MedicationPhase, sequence: number): string {
  if (phase.medicationId === "nexium") return "Tomar em jejum, antes do café da manhã.";
  if (phase.medicationId === "nac") return "Tomar de 30 a 60 minutos antes da rifaximina.";
  if (phase.medicationId === "rifaximina") return "Tomar após o NAC conforme a regra cadastrada.";
  if (phase.medicationId === "metronidazol") {
    return "Não consumir álcool durante o tratamento e por pelo menos 3 dias após a última dose.";
  }
  if (phase.medicationId === "oleo-oregano") return "Tomar antes do jantar.";
  return sequence === 1 ? "Horário organizacional; sem regra de refeição confirmada." : "Segunda tomada do dia.";
}

function makeDose(
  date: string,
  phase: MedicationPhase,
  sequenceNumber: number,
  scheduledMinute: number | null,
  timingBasis: string,
): DoseRecord {
  const id = `${date}-${phase.id}-${sequenceNumber}`;
  return {
    id,
    phaseId: phase.id,
    medicationId: phase.medicationId,
    medicationName: phase.medicationName,
    sequenceNumber,
    scheduledMinute,
    scheduledAtLocal: scheduledMinute === null ? null : localDateTime(date, scheduledMinute),
    takenMinute: null,
    quantity: phase.doseQuantity,
    doseUnit: phase.doseUnit,
    status: scheduledMinute === null ? "requires_review" : "planned",
    instruction: instructionFor(phase, sequenceNumber),
    timingBasis,
  };
}

function firstPhase(phases: MedicationPhase[], medicationId: string): MedicationPhase | undefined {
  return phases.find((phase) => phase.medicationId === medicationId);
}

export function generateDailySchedule(input: GenerateScheduleInput): DailySchedule {
  if (!isIsoDate(input.date)) throw new Error("Data deve estar no formato ISO yyyy-mm-dd.");
  if (!input.timezone) throw new Error("Timezone é obrigatório.");

  const wake = parseClock(input.wakeTime);
  const bed = parseClock(input.plannedBedtime);
  const phases = input.phases.filter((phase) => activeOn(phase, input.date));
  const hasActiveNexium = Boolean(firstPhase(phases, "nexium"));
  const breakfastRuleStart = wake + 30;
  const breakfastRuleEnd = wake + 60;
  const breakfastWindow = windowMinutes(input.breakfastWindow);
  const breakfastOverlapStart = Math.max(breakfastRuleStart, breakfastWindow.start);
  const breakfastOverlapEnd = Math.min(breakfastRuleEnd, breakfastWindow.end);
  const breakfast = hasActiveNexium
    ? breakfastOverlapStart <= breakfastOverlapEnd ? breakfastOverlapStart : wake + 45
    : wake > breakfastWindow.end ? Math.min(wake + 30, 1439) : closestInWindow(wake + 45, input.breakfastWindow);
  const doses: DoseRecord[] = [];
  const conflicts: ScheduleConflict[] = [];

  if (hasActiveNexium && breakfastOverlapStart > breakfastOverlapEnd) {
    conflicts.push(
      conflict(
        "BREAKFAST_WINDOW_OUTSIDE_NEXIUM_RULE",
        `A janela de café não cruza o intervalo cadastrado de 30 a 60 minutos após o despertar. O alvo foi mantido em ${formatClock(breakfast)}.`,
      ),
    );
  }

  const nexium = firstPhase(phases, "nexium");
  if (nexium) doses.push(makeDose(input.date, nexium, 1, wake, "Ao acordar"));

  const nac = firstPhase(phases, "nac");
  const rifaximina = firstPhase(phases, "rifaximina");
  let morningRifaximinaMinute: number | null = null;
  let eveningRifaximinaMinute: number | null = null;
  let eveningNacMinute: number | null = null;

  if (nac) {
    doses.push(makeDose(input.date, nac, 1, wake, "Alvo no despertar; agrupamento com Nexium requer revisão"));
    if (nexium) {
      conflicts.push(
        conflict(
          "UNCONFIRMED_NEXIUM_NAC_GROUPING",
          "Nexium e NAC aparecem no mesmo horário-alvo, mas o agrupamento permanente ainda não foi validado.",
          [doses.find((dose) => dose.medicationId === "nexium")!.id, doses.find((dose) => dose.medicationId === "nac")!.id],
          "warning",
          true,
        ),
      );
    }
  }

  if (rifaximina) {
    if (!nac) {
      conflicts.push(
        conflict(
          "MISSING_NAC_DEPENDENCY",
          "A rifaximina está ativa sem uma fase ativa de NAC; o horário exige revisão.",
          [],
          "blocking",
          true,
        ),
      );
    } else {
      morningRifaximinaMinute = breakfast;
      eveningRifaximinaMinute = morningRifaximinaMinute + (rifaximina.interval.targetMinutes ?? 720);
      eveningNacMinute = eveningRifaximinaMinute - 30;
      doses.push(makeDose(input.date, nac, 2, eveningNacMinute, "30 minutos antes da rifaximina noturna"));
    }
    doses.push(
      makeDose(input.date, rifaximina, 1, morningRifaximinaMinute, "30 a 60 minutos após o NAC matinal"),
      makeDose(input.date, rifaximina, 2, eveningRifaximinaMinute, "Intervalo-alvo cadastrado de 12 horas"),
    );
  } else if (nac) {
    doses.push(makeDose(input.date, nac, 2, null, "Sem rifaximina ativa para definir a dependência"));
    conflicts.push(
      conflict(
        "NAC_WITHOUT_ACTIVE_RIFAXIMINA",
        "O NAC está ativo sem rifaximina ativa; a segunda tomada não foi posicionada automaticamente.",
        [doses.at(-1)!.id],
        "blocking",
        true,
      ),
    );
  }

  const metronidazol = firstPhase(phases, "metronidazol");
  if (metronidazol) {
    const interval = metronidazol.interval.targetMinutes;
    if (interval === null) {
      for (let sequence = 1; sequence <= metronidazol.dosesPerDay; sequence += 1) {
        doses.push(makeDose(input.date, metronidazol, sequence, null, "Intervalo-alvo ausente"));
      }
    } else {
      for (let sequence = 1; sequence <= metronidazol.dosesPerDay; sequence += 1) {
        const minute = wake + interval * (sequence - 1);
        doses.push(makeDose(input.date, metronidazol, sequence, minute < 1440 ? minute : null, "Intervalo-alvo de 8 horas a partir do despertar"));
      }
    }
  }

  const dinnerTarget = eveningRifaximinaMinute ?? Math.round((windowMinutes(input.dinnerWindow).start + windowMinutes(input.dinnerWindow).end) / 2);
  const dinner = closestInWindow(dinnerTarget, input.dinnerWindow);
  if (eveningRifaximinaMinute !== null && dinner !== eveningRifaximinaMinute) {
    conflicts.push(
      conflict(
        "DINNER_WINDOW_DIFFERS_FROM_RIFAXIMINA",
        `A rifaximina noturna ficou às ${formatClock(eveningRifaximinaMinute)}, fora da janela de jantar informada.`,
      ),
    );
  }

  const berberina = firstPhase(phases, "berberina-caprilico");
  if (berberina) {
    if (berberina.dosesPerDay === 2) {
      doses.push(
        makeDose(input.date, berberina, 1, breakfast, "Bloco da manhã; sem relação com refeição confirmada"),
        makeDose(input.date, berberina, 2, dinner, "Bloco da noite; sem relação com refeição confirmada"),
      );
    } else {
      doses.push(makeDose(input.date, berberina, 1, breakfast, "Horário organizacional; sem relação com refeição confirmada"));
    }
  }

  const oregano = firstPhase(phases, "oleo-oregano");
  if (oregano) {
    if (eveningNacMinute !== null && eveningNacMinute < dinner) {
      doses.push(makeDose(input.date, oregano, 1, eveningNacMinute, "Agrupado com NAC noturno, conforme permitido no PRD"));
    } else {
      const oreganoDose = makeDose(input.date, oregano, 1, null, "Antecedência ao jantar não validada");
      doses.push(oreganoDose);
      conflicts.push(
        conflict(
          "OREGANO_LEAD_TIME_UNCONFIRMED",
          "O óleo de orégano deve ficar antes do jantar, mas a antecedência não foi informada. O horário não foi inferido.",
          [oreganoDose.id],
          "blocking",
          true,
        ),
      );
    }
  }

  for (const taken of input.alreadyTaken ?? []) {
    const dose = doses.find(
      (candidate) => candidate.medicationId === taken.medicationId && candidate.sequenceNumber === taken.sequenceNumber,
    );
    if (!dose) continue;
    dose.takenMinute = parseClock(taken.takenTime);
    if (dose.scheduledMinute === null) dose.status = "requires_review";
    else if (dose.takenMinute === dose.scheduledMinute) dose.status = "taken_on_time";
    else if (dose.takenMinute < dose.scheduledMinute) dose.status = "taken_early";
    else dose.status = "taken_late";
  }

  const meals: MealRecord[] = [
    { id: "breakfast", label: "Café da manhã", scheduledMinute: breakfast, scheduledAtLocal: localDateTime(input.date, breakfast) },
    { id: "dinner", label: "Jantar", scheduledMinute: dinner, scheduledAtLocal: localDateTime(input.date, dinner) },
  ];

  const draft: DailySchedule = {
    date: input.date,
    timezone: input.timezone,
    version: 1,
    status: "draft",
    generatedAt: input.now ?? new Date().toISOString(),
    generationReason: "checkin",
    wakeMinute: wake,
    plannedBedMinute: bed,
    doses: doses.sort((a, b) => (a.scheduledMinute ?? Number.MAX_SAFE_INTEGER) - (b.scheduledMinute ?? Number.MAX_SAFE_INTEGER)),
    meals,
    conflicts,
  };

  const validation = validateSchedule(draft, phases);
  const allConflicts = deduplicateConflicts([...conflicts, ...validation.conflicts]);
  return {
    ...draft,
    conflicts: allConflicts,
    status: allConflicts.some((item) => item.severity === "blocking" || item.requiresMedicalReview)
      ? "requires_review"
      : "draft",
  };
}

function deduplicateConflicts(conflicts: ScheduleConflict[]): ScheduleConflict[] {
  return [...new Map(conflicts.map((item) => [`${item.code}:${item.doseIds.join(",")}`, item])).values()];
}

export function detectConflicts(schedule: DailySchedule, phases: MedicationPhase[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));

  for (const dose of schedule.doses) {
    const phase = phaseById.get(dose.phaseId);
    if (!phase) {
      conflicts.push(conflict("UNKNOWN_PHASE", "A dose referencia uma fase inexistente.", [dose.id], "blocking"));
      continue;
    }
    if (!activeOn(phase, schedule.date)) {
      conflicts.push(conflict("DOSE_OUTSIDE_PHASE", "Dose criada fora da data de uso da fase.", [dose.id], "blocking"));
    }
    if (dose.scheduledMinute !== null && dose.scheduledMinute >= schedule.plannedBedMinute) {
      conflicts.push(
        conflict(
          "DOSE_AT_OR_AFTER_BEDTIME",
          `${dose.medicationName} ficou às ${formatClock(dose.scheduledMinute)}, no ou após o horário provável de dormir.`,
          [dose.id],
        ),
      );
    }
  }

  for (const phase of phases.filter((candidate) => activeOn(candidate, schedule.date))) {
    const phaseDoses = schedule.doses
      .filter((dose) => dose.phaseId === phase.id)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    if (phaseDoses.length !== phase.dosesPerDay) {
      conflicts.push(
        conflict(
          "WRONG_DAILY_FREQUENCY",
          `${phase.medicationName}: esperado ${phase.dosesPerDay} tomada(s), encontrado ${phaseDoses.length}.`,
          phaseDoses.map((dose) => dose.id),
          "blocking",
        ),
      );
    }
    for (let index = 1; index < phaseDoses.length; index += 1) {
      const previous = phaseDoses[index - 1]!;
      const current = phaseDoses[index]!;
      if (previous.scheduledMinute === null || current.scheduledMinute === null) continue;
      const interval = current.scheduledMinute - previous.scheduledMinute;
      if (phase.interval.minimumMinutes !== null && interval < phase.interval.minimumMinutes) {
        conflicts.push(conflict("BELOW_MINIMUM_INTERVAL", "Intervalo abaixo do mínimo validado.", [previous.id, current.id], "blocking", true));
      }
      if (phase.interval.maximumMinutes !== null && interval > phase.interval.maximumMinutes) {
        conflicts.push(conflict("ABOVE_MAXIMUM_INTERVAL", "Intervalo acima do máximo validado.", [previous.id, current.id], "blocking", true));
      }
    }
  }

  const breakfast = schedule.meals.find((meal) => meal.id === "breakfast");
  const nexium = schedule.doses.find((dose) => dose.medicationId === "nexium");
  if (nexium?.scheduledMinute !== null && nexium?.scheduledMinute !== undefined && breakfast) {
    const difference = breakfast.scheduledMinute - nexium.scheduledMinute;
    if (difference < 30 || difference > 60) {
      conflicts.push(conflict("NEXIUM_BREAKFAST_DEPENDENCY", "Nexium deve anteceder o café em 30 a 60 minutos.", [nexium.id], "blocking"));
    }
  }

  const rifaxDoses = schedule.doses.filter((dose) => dose.medicationId === "rifaximina");
  const nacDoses = schedule.doses.filter((dose) => dose.medicationId === "nac");
  rifaxDoses.forEach((rifax, index) => {
    const nac = nacDoses[index];
    if (!nac || rifax.scheduledMinute === null || nac.scheduledMinute === null) return;
    const difference = rifax.scheduledMinute - nac.scheduledMinute;
    if (difference < 30 || difference > 60) {
      conflicts.push(conflict("NAC_RIFAXIMINA_DEPENDENCY", "NAC deve anteceder a rifaximina em 30 a 60 minutos.", [nac.id, rifax.id], "blocking"));
    }
  });

  const duplicateKeys = new Set<string>();
  for (const dose of schedule.doses) {
    const key = `${dose.phaseId}:${dose.sequenceNumber}`;
    if (duplicateKeys.has(key)) conflicts.push(conflict("DUPLICATE_DOSE", "Dose duplicada detectada.", [dose.id], "blocking"));
    duplicateKeys.add(key);
  }
  return deduplicateConflicts(conflicts);
}

export function validateSchedule(schedule: DailySchedule, phases: MedicationPhase[]): ValidationResult {
  const conflicts = detectConflicts(schedule, phases);
  return { valid: !conflicts.some((item) => item.severity === "blocking"), conflicts };
}

export function recalculateAfterDoseTaken(
  event: DoseTakenEvent,
  schedule: DailySchedule,
  phases: MedicationPhase[],
): DailySchedule {
  const dose = schedule.doses.find((candidate) => candidate.id === event.doseId);
  if (!dose) throw new Error("Dose não encontrada.");
  if (dose.takenMinute !== null) return schedule;

  const takenMinute = parseClock(event.takenTime);
  const updatedDoses = schedule.doses.map((candidate) => {
    if (candidate.id !== dose.id) return { ...candidate };
    const status = candidate.scheduledMinute === null
      ? "requires_review"
      : takenMinute === candidate.scheduledMinute
        ? "taken_on_time"
        : takenMinute < candidate.scheduledMinute
          ? "taken_early"
          : "taken_late";
    return { ...candidate, takenMinute, status } as DoseRecord;
  });
  const phase = phases.find((candidate) => candidate.id === dose.phaseId);
  if (!phase) throw new Error("Fase da dose não encontrada.");

  const addedConflicts: ScheduleConflict[] = [];
  if (!phase.reschedulePolicy.confirmed || phase.reschedulePolicy.moveFutureDoses !== true) {
    addedConflicts.push(
      conflict(
        "RESCHEDULE_POLICY_UNCONFIRMED",
        "O horário real foi salvo, mas as próximas doses não foram movidas porque a política de atraso ainda não foi validada.",
        [dose.id],
        "warning",
        true,
      ),
    );
  } else if (phase.interval.targetMinutes !== null) {
    const following = updatedDoses
      .filter((candidate) => candidate.phaseId === phase.id && candidate.sequenceNumber > dose.sequenceNumber && candidate.takenMinute === null)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    let anchor = takenMinute;
    let anchorSequence = dose.sequenceNumber;
    for (const candidate of following) {
      const proposed = anchor + phase.interval.targetMinutes * (candidate.sequenceNumber - anchorSequence);
      if (proposed >= 1440) {
        candidate.status = "requires_review";
        addedConflicts.push(conflict("RESCHEDULE_CROSSES_DAY", "O reagendamento ultrapassaria o dia atual.", [candidate.id], "blocking", true));
        continue;
      }
      candidate.scheduledMinute = proposed;
      candidate.scheduledAtLocal = localDateTime(schedule.date, proposed);
      anchor = proposed;
      anchorSequence = candidate.sequenceNumber;
    }
  }

  const recalculated: DailySchedule = {
    ...schedule,
    version: schedule.version + 1,
    generatedAt: event.occurredAt ?? new Date().toISOString(),
    generationReason: "dose_taken",
    doses: updatedDoses,
    conflicts: deduplicateConflicts([...schedule.conflicts, ...addedConflicts]),
  };
  const validation = validateSchedule(recalculated, phases);
  const conflicts = deduplicateConflicts([...recalculated.conflicts, ...validation.conflicts]);
  return {
    ...recalculated,
    conflicts,
    status: conflicts.some((item) => item.severity === "blocking" || item.requiresMedicalReview)
      ? "requires_review"
      : "draft",
  };
}
