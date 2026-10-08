import { cleanupConfig } from "../config/retention.js";
import { runRetentionCleanupBatch } from "./retention-cleanup.service.js";

let workerTimer: NodeJS.Timeout | undefined;
let currentCycle: Promise<void> | undefined;
let workerStopping = false;

function scheduleNextCycle() {
  if (workerStopping || workerTimer) return;
  workerTimer = setTimeout(() => {
    workerTimer = undefined;
    if (workerStopping) return;
    currentCycle = runRetentionCleanupBatch()
      .then((removed) => {
        const total = Object.values(removed).reduce((sum, count) => sum + count, 0);
        if (total > 0) console.info("Limpeza de retenção concluída", { removed });
      })
      .catch((error) => {
        console.error("Falha no ciclo de limpeza de retenção", {
          error: error instanceof Error ? error.name : "erro desconhecido",
        });
      })
      .finally(() => {
        currentCycle = undefined;
        scheduleNextCycle();
      });
  }, cleanupConfig().pollIntervalMs);
  workerTimer.unref();
}

export function startRetentionCleanupWorker() {
  if (process.env.NODE_ENV === "test" || workerTimer || currentCycle) return;
  workerStopping = false;
  scheduleNextCycle();
}

export function isRetentionCleanupWorkerRunning() {
  return !workerStopping && Boolean(workerTimer || currentCycle);
}

export async function stopRetentionCleanupWorker() {
  workerStopping = true;
  if (workerTimer) clearTimeout(workerTimer);
  workerTimer = undefined;
  await currentCycle;
}
