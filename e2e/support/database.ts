import { randomUUID } from "node:crypto";

import { applyE2EEnvironment } from "../../scripts/e2e-env.mjs";

export type InternalUserRole = "ADMIN" | "ATTENDANT" | "TECHNICIAN";

export interface E2EUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: InternalUserRole;
}

let databaseModulePromise: Promise<
  typeof import("../../apps/backend/tests/helpers/test-db.js")
> | null = null;

function databaseModule() {
  applyE2EEnvironment();
  databaseModulePromise ??= import(
    "../../apps/backend/tests/helpers/test-db.js"
  );
  return databaseModulePromise;
}

export async function getTestDatabase() {
  return (await databaseModule()).testPrisma;
}

export async function resetE2EDatabase() {
  const { resetDatabase } = await databaseModule();
  await resetDatabase();
}

export async function disconnectE2EDatabase() {
  const database = await getTestDatabase();
  await database.$disconnect();
}

export async function assertE2EDatabaseReachable() {
  const database = await getTestDatabase();
  await database.$queryRaw`SELECT 1`;
}

export async function createE2EUser(
  role: InternalUserRole,
  runId: string,
  overrides: Partial<Pick<E2EUser, "name" | "email" | "password">> = {},
): Promise<E2EUser> {
  const { hashPassword } = await import(
    "../../apps/backend/src/lib/password.js"
  );
  const database = await getTestDatabase();
  const suffix = randomUUID().slice(0, 8);
  const password = overrides.password ?? `E2e-${randomUUID()}-Aa1!`;
  const email =
    overrides.email ?? `${role.toLowerCase()}-${runId}-${suffix}@example.test`;
  const name = overrides.name ?? `${role} E2E ${runId}`;

  const user = await database.user.create({
    data: {
      name,
      email,
      password: await hashPassword(password),
      role,
      isPrimaryAdmin: role === "ADMIN",
    },
  });

  return { id: user.id, name, email, password, role };
}

export async function createE2ECustomer(runId: string, name?: string) {
  const database = await getTestDatabase();
  const suffix = randomUUID().slice(0, 8);
  return database.customer.create({
    data: {
      name: name ?? `Cliente E2E ${runId}`,
      email: `cliente-${runId}-${suffix}@example.test`,
      phone: "11999990000",
      document: `E2E-${runId}-${suffix}`,
      address: "Rua de Teste, 123",
    },
  });
}

export async function createE2EServiceOrder(params: {
  customerId: string;
  createdById: string;
  runId: string;
  title?: string;
  technicianId?: string | null;
  status?: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "CANCELLED";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}) {
  const database = await getTestDatabase();
  return database.serviceOrder.create({
    data: {
      title: params.title ?? `Ordem E2E ${params.runId}`,
      description: "Descrição criada para a suíte E2E local.",
      customerId: params.customerId,
      createdById: params.createdById,
      technicianId: params.technicianId ?? null,
      status: params.status ?? "OPEN",
      priority: params.priority ?? "MEDIUM",
    },
  });
}

export async function verifyStoredPassword(
  storedHash: string,
  plainText: string,
) {
  const { verifyPassword } = await import(
    "../../apps/backend/src/lib/password.js"
  );
  return verifyPassword(storedHash, plainText);
}
