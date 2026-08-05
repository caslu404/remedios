import { z } from "zod";

export const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const windowSchema = z.object({ start: clockSchema, end: clockSchema });

export const scheduleInputSchema = z.object({
  date: dateSchema,
  timezone: z.string().min(1).max(80).default("America/Sao_Paulo"),
  wakeTime: clockSchema,
  plannedBedtime: clockSchema,
  breakfastWindow: windowSchema,
  dinnerWindow: windowSchema,
});

export const takenSchema = z.object({ takenTime: clockSchema, date: dateSchema.optional() });
