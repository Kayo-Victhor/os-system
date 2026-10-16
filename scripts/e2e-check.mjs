import { spawnSync } from "node:child_process";
import { createServer } from "node:net";

import { loadE2EEnvironment } from "./e2e-env.mjs";

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        reject(
          new Error(
            `A porta ${port} já está ocupada. Encerre o servidor existente antes de executar a suíte E2E.`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(resolve);
    });
  });
}

const config = loadE2EEnvironment();

await Promise.all([assertPortAvailable(3333), assertPortAvailable(5173)]);

console.log(
  `[e2e-db] host=${config.database.host} port=${config.database.port} database=${config.database.name}`,
);

const migration = spawnSync("pnpm", ["--filter", "backend", "test:migrate"], {
  cwd: config.rootDir,
  env: config.environment,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (migration.error) {
  throw new Error(`Não foi possível validar as migrations E2E: ${migration.error.message}`);
}
if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}
