import { randomUUID } from "node:crypto";

import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

import {
  createE2EUser,
  getTestDatabase,
  resetE2EDatabase,
  type E2EUser,
} from "./database.js";

type TestDatabase = Awaited<ReturnType<typeof getTestDatabase>>;

interface E2EFixtures {
  database: TestDatabase;
  runId: string;
  admin: E2EUser;
  consoleGuard: void;
}

function isExpectedUnauthenticatedResource(message: ConsoleMessage) {
  return (
    message.type() === "error" &&
    message.text().includes("Failed to load resource") &&
    message.text().includes("401")
  );
}

export const test = base.extend<E2EFixtures>({
  database: [
    async ({}, use) => {
      await resetE2EDatabase();
      const database = await getTestDatabase();
      await use(database);
      await resetE2EDatabase();
    },
    { auto: true },
  ],

  runId: async ({}, use, testInfo) => {
    const identifier = `${testInfo.workerIndex}-${randomUUID().slice(0, 8)}`;
    await use(identifier);
  },

  admin: async ({ database, runId }, use) => {
    void database;
    const admin = await createE2EUser("ADMIN", runId, {
      name: `Administrador E2E ${runId}`,
    });
    await use(admin);
  },

  consoleGuard: [
    async ({ page }, use) => {
      const failures: string[] = [];
      page.on("pageerror", (error) =>
        failures.push(`pageerror: ${error.message}`),
      );
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !isExpectedUnauthenticatedResource(message)
        ) {
          failures.push(`console: ${message.text()}`);
        }
      });

      await use();
      expect(failures, "erros inesperados no navegador").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect, type Page };
