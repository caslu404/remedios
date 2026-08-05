import { describe, expect, it } from "vitest";
import { nextDailyReminderIso } from "./day-start";

describe("nextDailyReminderIso", () => {
  it("agenda para o mesmo dia quando o horário ainda não passou", () => {
    expect(nextDailyReminderIso("06:00", "America/Sao_Paulo", new Date("2026-08-05T08:00:00Z")))
      .toBe("2026-08-05T09:00:00.000Z");
  });

  it("agenda para o dia seguinte quando o horário já passou", () => {
    expect(nextDailyReminderIso("06:00", "America/Sao_Paulo", new Date("2026-08-05T10:00:00Z")))
      .toBe("2026-08-06T09:00:00.000Z");
  });
});
