import { describe, expect, it } from "vitest";

import {
  DEFAULT_SERVER_PORT,
  resolveServerPort,
} from "../src/config/server.js";

describe("configuração da porta do backend", () => {
  it("usa 3333 quando PORT não está definida ou está vazia", () => {
    expect(resolveServerPort(undefined)).toBe(DEFAULT_SERVER_PORT);
    expect(resolveServerPort("")).toBe(DEFAULT_SERVER_PORT);
  });

  it("aceita uma porta válida configurada explicitamente", () => {
    expect(resolveServerPort("4000")).toBe(4000);
  });

  it("aceita os limites inferior e superior", () => {
    expect(resolveServerPort("1")).toBe(1);
    expect(resolveServerPort("65535")).toBe(65_535);
  });

  it.each([
    "abc",
    "3333abc",
    "3333.5",
    " 3333",
    "3333 ",
    "0",
    "-1",
    "65536",
  ])("rejeita PORT inválida: %s", (value) => {
    expect(() => resolveServerPort(value)).toThrow(
      "PORT deve ser um número inteiro entre 1 e 65535",
    );
  });
});
