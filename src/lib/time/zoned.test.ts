import { describe, expect, it } from "vitest";
import { minuteToClock, zonedMinuteToIso } from "./zoned";

describe("tempo persistido", () => {
  it("converte o horário local de São Paulo para um instante UTC", () => {
    expect(zonedMinuteToIso("2026-08-06", 7 * 60, "America/Sao_Paulo")).toBe("2026-08-06T10:00:00.000Z");
  });

  it("formata o minuto local para a coluna time", () => {
    expect(minuteToClock(23 * 60 + 5)).toBe("23:05:00");
  });
});
