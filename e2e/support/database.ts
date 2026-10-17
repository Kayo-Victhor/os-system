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

export interface E2ECustomerAccount {
  id: string;
  email: string;
  password: string;
  customer: {
    id: string;
    name: string;
  };
}

type E2EEmailOutboxType =
  | "CUSTOMER_REGISTRATION_VERIFICATION"
  | "CUSTOMER_PASSWORD_RESET";

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

/**
 * Creates a confirmed customer identity directly for scenarios that are not
 * about registration itself. Its credentials are random and live only in the
 * local E2E database.
 */
export async function createE2ECustomerAccount(
  runId: string,
  overrides: Partial<Pick<E2ECustomerAccount, "email" | "password">> & {
    name?: string;
  } = {},
): Promise<E2ECustomerAccount> {
  const { hashPassword } = await import(
    "../../apps/backend/src/lib/password.js"
  );
  const database = await getTestDatabase();
  const suffix = randomUUID().slice(0, 8);
  const email = overrides.email ?? `portal-${runId}-${suffix}@example.test`;
  const password = overrides.password ?? `E2e-${randomUUID()}-Aa1!`;
  const customer = await database.customer.create({
    data: {
      name: overrides.name ?? `Cliente portal E2E ${runId}`,
      email,
      phone: "11999990000",
      document: `PORTAL-${runId}-${suffix}`,
      address: "Rua do Portal, 123",
    },
  });
  const account = await database.customerAccount.create({
    data: {
      customerId: customer.id,
      email,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
    },
  });

  return {
    id: account.id,
    email,
    password,
    customer: { id: customer.id, name: customer.name },
  };
}

/**
 * Reads a disposable link token only from the isolated test outbox. The token
 * is intentionally returned to the test runner and is never printed.
 */
export async function readE2EOutboxToken(
  type: E2EEmailOutboxType,
  recipient: string,
): Promise<string> {
  const database = await getTestDatabase();
  const event = await database.emailOutbox.findFirst({
    where: { type, recipient },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { payload: true },
  });
  const payload = event?.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof payload.token !== "string"
  ) {
    throw new Error("Link descartável não encontrado na outbox E2E.");
  }
  return payload.token;
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
