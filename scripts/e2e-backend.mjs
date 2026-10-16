import { spawn } from "node:child_process";

import { loadE2EEnvironment } from "./e2e-env.mjs";

const config = loadE2EEnvironment();
const child = spawn(
  "pnpm",
  ["--filter", "backend", "exec", "tsx", "src/server.ts"],
  {
    cwd: config.rootDir,
    env: config.environment,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

function forward(signal) {
  if (!child.killed) child.kill(signal);
}

process.once("SIGINT", () => forward("SIGINT"));
process.once("SIGTERM", () => forward("SIGTERM"));

child.once("error", (error) => {
  console.error(`Falha ao iniciar o backend E2E: ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
