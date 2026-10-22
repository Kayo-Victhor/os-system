const RECOVERY_KEY = "os-system:chunk-recovery";
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;

interface RecoveryAttempt {
  attemptedAt: number;
}

interface VitePreloadErrorEvent extends Event {
  payload?: unknown;
}

function readAttempt(storage: Storage): RecoveryAttempt | null {
  try {
    const parsed = JSON.parse(storage.getItem(RECOVERY_KEY) ?? "null") as Partial<RecoveryAttempt> | null;
    return typeof parsed?.attemptedAt === "number"
      ? { attemptedAt: parsed.attemptedAt }
      : null;
  } catch {
    return null;
  }
}

export function canAutomaticallyRecoverChunk(
  storage: Storage,
  now = Date.now(),
) {
  const attempt = readAttempt(storage);
  return !attempt || now - attempt.attemptedAt >= RECOVERY_WINDOW_MS;
}

export function markChunkRecoveryAttempt(
  storage: Storage,
  now = Date.now(),
) {
  try {
    storage.setItem(RECOVERY_KEY, JSON.stringify({ attemptedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function clearChunkRecoveryAttempt(storage: Storage) {
  try {
    storage.removeItem(RECOVERY_KEY);
  } catch {
    // A manual reload must remain available when sessionStorage is blocked.
  }
}

export function installChunkLoadRecovery(target: Window = window) {
  target.addEventListener("vite:preloadError", (event) => {
    const preloadEvent = event as VitePreloadErrorEvent;
    event.preventDefault();
    console.error("Falha ao carregar um recurso da aplicação.", preloadEvent.payload);

    let storage: Storage;
    try {
      storage = target.sessionStorage;
    } catch {
      return;
    }

    if (!canAutomaticallyRecoverChunk(storage)) return;

    if (!markChunkRecoveryAttempt(storage)) return;
    target.location.reload();
  });
}

export { RECOVERY_KEY, RECOVERY_WINDOW_MS };
