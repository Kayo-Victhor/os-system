import { describe, expect, it } from "vitest";

import {
  classifyResolutionSla,
  RESOLUTION_SLA_DUE_SOON_MINUTES,
  RESOLUTION_SLA_MINUTES,
  resolutionSlaForPriority,
} from "../src/domain/service-order-sla.js";

const CREATED_AT = new Date("2026-10-21T12:00:00.000Z");

describe("SLA de resolução", () => {
  it.each([
    ["URGENT", 240],
    ["HIGH", 480],
    ["MEDIUM", 1_440],
    ["LOW", 4_320],
  ] as const)("atribui %s com meta de %i minutos", (priority, targetMinutes) => {
    const result = resolutionSlaForPriority(priority, CREATED_AT);

    expect(RESOLUTION_SLA_MINUTES[priority]).toBe(targetMinutes);
    expect(result.targetMinutes).toBe(targetMinutes);
    expect(result.dueAt.getTime()).toBe(CREATED_AT.getTime() + targetMinutes * 60_000);
  });

  it("classifica os limites de acompanhamento sem depender do fuso local", () => {
    const dueAt = new Date("2026-10-21T16:00:00.000Z");
    const active = { status: "OPEN" as const, targetMinutes: 240, dueAt };

    expect(classifyResolutionSla(active, new Date("2026-10-21T14:59:59.999Z")))
      .toBe("ON_TRACK");
    expect(classifyResolutionSla(active, new Date("2026-10-21T15:00:00.000Z")))
      .toBe("DUE_SOON");
    expect(classifyResolutionSla(active, dueAt)).toBe("DUE_SOON");
    expect(classifyResolutionSla(active, new Date("2026-10-21T16:00:00.001Z")))
      .toBe("BREACHED");
    expect(RESOLUTION_SLA_DUE_SOON_MINUTES).toBe(60);
  });

  it("não pausa o relógio durante WAITING", () => {
    const input = {
      status: "WAITING" as const,
      targetMinutes: 240,
      dueAt: new Date("2026-10-21T16:00:00.000Z"),
    };

    expect(classifyResolutionSla(input, new Date("2026-10-21T16:01:00.000Z")))
      .toBe("BREACHED");
  });

  it("usa o instante real de conclusão para distinguir MET de BREACHED", () => {
    const base = {
      status: "COMPLETED" as const,
      targetMinutes: 240,
      dueAt: new Date("2026-10-21T16:00:00.000Z"),
    };

    expect(classifyResolutionSla({ ...base, completedAt: base.dueAt })).toBe("MET");
    expect(classifyResolutionSla({
      ...base,
      completedAt: new Date("2026-10-21T16:00:00.001Z"),
    })).toBe("BREACHED");
    expect(classifyResolutionSla(base)).toBe("UNTRACKED");
  });

  it("distingue cancelamento monitorado e ordem legada sem SLA", () => {
    expect(classifyResolutionSla({
      status: "CANCELLED",
      targetMinutes: 240,
      dueAt: new Date("2026-10-21T16:00:00.000Z"),
    })).toBe("CANCELLED");

    expect(classifyResolutionSla({
      status: "OPEN",
      targetMinutes: null,
      dueAt: null,
    })).toBe("UNTRACKED");
  });
});
