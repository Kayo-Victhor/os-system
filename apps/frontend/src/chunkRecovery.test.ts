import { describe, expect, it } from "vitest";

import {
  RECOVERY_WINDOW_MS,
  canAutomaticallyRecoverChunk,
  clearChunkRecoveryAttempt,
  markChunkRecoveryAttempt,
} from "./chunkRecovery.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("recuperação de chunks", () => {
  it("permite apenas uma recarga automática dentro da janela de proteção", () => {
    const storage = memoryStorage();
    const now = 10_000;

    expect(canAutomaticallyRecoverChunk(storage, now)).toBe(true);
    markChunkRecoveryAttempt(storage, now);
    expect(canAutomaticallyRecoverChunk(storage, now + 1)).toBe(false);
    expect(canAutomaticallyRecoverChunk(storage, now + RECOVERY_WINDOW_MS)).toBe(true);
  });

  it("libera uma nova tentativa quando o usuário aciona a recuperação manual", () => {
    const storage = memoryStorage();
    markChunkRecoveryAttempt(storage, 10_000);

    clearChunkRecoveryAttempt(storage);

    expect(canAutomaticallyRecoverChunk(storage, 10_001)).toBe(true);
  });

  it("não inicia recarga automática quando o navegador bloqueia o marcador de sessão", () => {
    const storage = memoryStorage();
    storage.setItem = () => { throw new DOMException("blocked", "SecurityError"); };

    expect(markChunkRecoveryAttempt(storage, 10_000)).toBe(false);
  });
});
