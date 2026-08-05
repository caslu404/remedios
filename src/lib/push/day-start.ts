import { parseClock } from "../../domain/scheduling";
import { zonedMinuteToIso } from "../time/zoned";

function dateAndMinuteInTimeZone(now: Date, timeZone: string): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minute: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function addIsoDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function nextDailyReminderIso(
  time: string,
  timeZone = "America/Sao_Paulo",
  now = new Date(),
): string {
  const current = dateAndMinuteInTimeZone(now, timeZone);
  const targetMinute = parseClock(time);
  const targetDate = targetMinute <= current.minute ? addIsoDays(current.date, 1) : current.date;
  return zonedMinuteToIso(targetDate, targetMinute, timeZone);
}
