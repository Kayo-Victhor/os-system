import { testPrisma } from "./test-db.js";
import { hashPassword } from "../../src/lib/password.js";
import type { UserRole } from "../../src/generated/prisma/client.js";

export const FIXTURE_PASSWORD = "correct-horse-battery-staple";

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createFixtureUser(
  role: UserRole,
  overrides: { name?: string; email?: string; password?: string } = {},
) {
  const password = overrides.password ?? FIXTURE_PASSWORD;
  const passwordHash = await hashPassword(password);

  const user = await testPrisma.user.create({
    data: {
      name: overrides.name ?? `${role} ${unique("user")}`,
      email: overrides.email ?? `${unique(role.toLowerCase())}@example.com`,
      password: passwordHash,
      role,
    },
  });

  return { user, password };
}

export async function createFixtureCustomer(
  overrides: Partial<{
    name: string;
    email: string;
    phone: string;
    document: string;
    address: string;
  }> = {},
) {
  return testPrisma.customer.create({
    data: {
      name: overrides.name ?? `Customer ${unique("customer")}`,
      email: overrides.email ?? `${unique("customer")}@example.com`,
      phone: overrides.phone ?? "11999998888",
      document: overrides.document ?? unique("doc"),
      address: overrides.address,
    },
  });
}

export async function createFixtureServiceOrder(params: {
  customerId: string;
  createdById: string;
  technicianId?: string | null;
  title?: string;
  description?: string;
  status?: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "CANCELLED";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}) {
  return testPrisma.serviceOrder.create({
    data: {
      title: params.title ?? `Service order ${unique("os")}`,
      description: params.description ?? "Descrição de teste",
      status: params.status ?? "OPEN",
      priority: params.priority ?? "MEDIUM",
      customerId: params.customerId,
      createdById: params.createdById,
      technicianId: params.technicianId ?? null,
    },
  });
}
