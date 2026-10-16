import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyE2EEnvironment } from "../scripts/e2e-env.mjs";
import {
  assertE2EDatabaseReachable,
  disconnectE2EDatabase,
  resetE2EDatabase,
} from "./support/database.js";

function processIsRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireSuiteLock(databaseName: string) {
  const lockPath = join(tmpdir(), `os-system-e2e-${databaseName}.lock`);

  if (existsSync(lockPath)) {
    const previousPid = Number(readFileSync(lockPath, "utf8"));
    if (Number.isInteger(previousPid) && processIsRunning(previousPid)) {
      throw new Error(
        `Outra suíte E2E parece estar usando ${databaseName} (PID ${previousPid}).`,
      );
    }
    unlinkSync(lockPath);
  }

  const descriptor = openSync(lockPath, "wx", 0o600);
  writeFileSync(descriptor, String(process.pid));
  closeSync(descriptor);
  return lockPath;
}

export default async function globalSetup() {
  const config = applyE2EEnvironment();
  const lockPath = acquireSuiteLock(config.database.name);

  try {
    await assertE2EDatabaseReachable();
    await resetE2EDatabase();
  } catch (error) {
    if (existsSync(lockPath)) unlinkSync(lockPath);
    await disconnectE2EDatabase().catch(() => undefined);
    throw error;
  }

  return async () => {
    try {
      await resetE2EDatabase();
    } finally {
      await disconnectE2EDatabase().catch(() => undefined);
      if (existsSync(lockPath)) unlinkSync(lockPath);
    }
  };
}
