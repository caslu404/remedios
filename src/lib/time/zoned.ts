export function minuteToClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`;
}

export function zonedMinuteToIso(date: string, minute: number, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;
  const desired = Date.UTC(year!, month! - 1, day!, hour, minutePart, 0);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    guess += desired - represented;
  }
  return new Date(guess).toISOString();
}
