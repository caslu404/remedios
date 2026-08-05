import type { TimeWindow } from "./types";

const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseClock(value: string): number {
  if (!CLOCK_PATTERN.test(value)) {
    throw new Error(`Horário inválido: ${value}`);
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}

export function formatClock(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new Error(`Minuto do dia inválido: ${minutes}`);
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function localDateTime(date: string, minute: number): string {
  return `${date}T${formatClock(minute)}:00`;
}

export function windowMinutes(window: TimeWindow): { start: number; end: number } {
  const start = parseClock(window.start);
  const end = parseClock(window.end);
  if (end < start) throw new Error("Janelas que cruzam a meia-noite não são aceitas no MVP.");
  return { start, end };
}

export function closestInWindow(target: number, window: TimeWindow): number {
  const { start, end } = windowMinutes(window);
  return Math.min(Math.max(target, start), end);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
