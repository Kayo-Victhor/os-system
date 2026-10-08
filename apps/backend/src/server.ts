import "dotenv/config";
import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import {
  startEmailOutboxWorker,
  stopEmailOutboxWorker,
} from "./services/email-outbox.worker.js";

const PORT = 3333;

const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  startEmailOutboxWorker();
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("Encerrando backend", { signal });

  const forceClose = setTimeout(() => server.closeAllConnections(), 15_000);
  forceClose.unref();

  try {
    await Promise.all([
      stopEmailOutboxWorker(),
      new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      }),
    ]);
    await prisma.$disconnect();
  } catch (error) {
    process.exitCode = 1;
    console.error("Falha no encerramento do backend", {
      error: error instanceof Error ? error.name : "erro desconhecido",
    });
  } finally {
    clearTimeout(forceClose);
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
