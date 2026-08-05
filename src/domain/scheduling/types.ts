export type DoseStatus =
  | "planned"
  | "notified"
  | "snoozed"
  | "taken_on_time"
  | "taken_late"
  | "taken_early"
  | "skipped"
  | "missed"
  | "cancelled_by_schedule_change"
  | "requires_review";

export type Rigidity = "high" | "medium" | "low";

export interface ValidatedInterval {
  targetMinutes: number | null;
  minimumMinutes: number | null;
  maximumMinutes: number | null;
  source: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  notes: string | null;
}

export interface MedicationPhase {
  id: string;
  medicationId: string;
  medicationName: string;
  phaseName: string;
  startDate: string;
  endDate: string | null;
  doseQuantity: number;
  doseUnit: string;
  dosesPerDay: number;
  interval: ValidatedInterval;
  rigidity: Rigidity;
  continuous?: boolean;
  slotStrategy:
    | "wake"
    | "after_morning_nac"
    | "target_interval"
    | "meal_blocks"
    | "before_dinner";
  dependency?: {
    medicationId: string;
    minimumMinutes: number | null;
    maximumMinutes: number | null;
    confirmed: boolean;
    source: string | null;
  };
  reschedulePolicy: {
    moveFutureDoses: boolean | null;
    confirmed: boolean;
    source: string | null;
  };
}

export interface TimeWindow {
  start: string;
  end: string;
}

export interface DoseRecord {
  id: string;
  phaseId: string;
  medicationId: string;
  medicationName: string;
  sequenceNumber: number;
  scheduledMinute: number | null;
  scheduledAtLocal: string | null;
  takenMinute: number | null;
  quantity: number;
  doseUnit: string;
  status: DoseStatus;
  instruction: string;
  timingBasis: string;
}

export interface MealRecord {
  id: "breakfast" | "dinner";
  label: string;
  scheduledMinute: number;
  scheduledAtLocal: string;
}

export type ConflictSeverity = "info" | "warning" | "blocking";

export interface ScheduleConflict {
  code: string;
  severity: ConflictSeverity;
  message: string;
  doseIds: string[];
  requiresMedicalReview: boolean;
}

export interface DailySchedule {
  date: string;
  timezone: string;
  version: number;
  status: "draft" | "confirmed" | "requires_review";
  generatedAt: string;
  generationReason: "checkin" | "dose_taken" | "manual";
  wakeMinute: number;
  plannedBedMinute: number;
  doses: DoseRecord[];
  meals: MealRecord[];
  conflicts: ScheduleConflict[];
}

export interface GenerateScheduleInput {
  date: string;
  timezone: string;
  wakeTime: string;
  plannedBedtime: string;
  breakfastWindow: TimeWindow;
  dinnerWindow: TimeWindow;
  phases: MedicationPhase[];
  alreadyTaken?: Array<{
    medicationId: string;
    sequenceNumber: number;
    takenTime: string;
  }>;
  now?: string;
}

export interface DoseTakenEvent {
  doseId: string;
  takenTime: string;
  occurredAt?: string;
}

export interface ValidationResult {
  valid: boolean;
  conflicts: ScheduleConflict[];
}
