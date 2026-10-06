import { prisma } from "../lib/prisma.js";
import type { CreateCustomerInput } from "../schemas/customer.schema.js";
import type { Prisma } from "../generated/prisma/client.js";

const customerAccountStatusSelect = {
  status: true,
} satisfies Prisma.CustomerAccountSelect;

const customerWithAccount = {
  customerAccount: { select: customerAccountStatusSelect },
} satisfies Prisma.CustomerInclude;

interface LockedCustomer {
  id: string;
}

interface LockedCustomerAccount {
  id: string;
  status: "ACTIVE" | "SUSPENDED";
}

export type CustomerLifecycleErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "ACCOUNT_NOT_FOUND"
  | "SERVICE_ORDER_HISTORY_EXISTS";

export class CustomerLifecycleError extends Error {
  constructor(public readonly code: CustomerLifecycleErrorCode) {
    super(code);
    this.name = "CustomerLifecycleError";
  }
}

async function lockCustomer(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<LockedCustomer> {
  const [customer] = await tx.$queryRaw<LockedCustomer[]>`
    SELECT "id"
    FROM "Customer"
    WHERE "id" = ${customerId}
    FOR UPDATE
  `;
  if (!customer) throw new CustomerLifecycleError("CUSTOMER_NOT_FOUND");
  return customer;
}

async function lockCustomerAccount(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<LockedCustomerAccount | null> {
  const [account] = await tx.$queryRaw<LockedCustomerAccount[]>`
    SELECT "id", "status"
    FROM "CustomerAccount"
    WHERE "customerId" = ${customerId}
    FOR UPDATE
  `;
  return account ?? null;
}

async function invalidateCustomerAccountSecurity(
  tx: Prisma.TransactionClient,
  customerAccountId: string,
  now: Date,
) {
  await tx.customerAccountPasswordResetToken.deleteMany({
    where: { customerAccountId },
  });
  await tx.customerSessionRefreshToken.updateMany({
    where: {
      consumedAt: null,
      customerSession: { customerAccountId },
    },
    data: { consumedAt: now },
  });
  await tx.customerSession.updateMany({
    where: { customerAccountId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function createCustomer(data: CreateCustomerInput) {
  return prisma.customer.create({
    data,
    include: customerWithAccount,
  });
}

export interface ListCustomersFilters {
  search?: string;
}

export async function listCustomers(filters: ListCustomersFilters = {}) {
  const where: Prisma.CustomerWhereInput = filters.search
    ? {
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { email: { contains: filters.search, mode: "insensitive" } },
          { document: { contains: filters.search, mode: "insensitive" } },
        ],
      }
    : {};

  return prisma.customer.findMany({
    where,
    include: customerWithAccount,
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function listCustomersForTechnician(
  technicianId: string,
  filters: ListCustomersFilters = {},
) {
  const searchWhere: Prisma.CustomerWhereInput = filters.search
    ? {
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { email: { contains: filters.search, mode: "insensitive" } },
          { document: { contains: filters.search, mode: "insensitive" } },
        ],
      }
    : {};

  return prisma.customer.findMany({
    where: {
      ...searchWhere,
      serviceOrders: { some: { technicianId } },
    },
    include: customerWithAccount,
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomerById(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: customerWithAccount,
  });
}

export async function getCustomerByIdForTechnician(id: string, technicianId: string) {
  return prisma.customer.findFirst({
    where: {
      id,
      serviceOrders: { some: { technicianId } },
    },
    include: customerWithAccount,
  });
}

export async function updateCustomer(
  id: string,
  data: Partial<CreateCustomerInput>
) {
  return prisma.customer.update({
    where: { id },
    data,
    include: customerWithAccount,
  });
}

export async function deleteCustomer(id: string) {
  return prisma.$transaction(async (tx) => {
    await lockCustomer(tx, id);
    const serviceOrderCount = await tx.serviceOrder.count({
      where: { customerId: id },
    });
    if (serviceOrderCount > 0) {
      throw new CustomerLifecycleError("SERVICE_ORDER_HISTORY_EXISTS");
    }

    const account = await lockCustomerAccount(tx, id);
    if (account) {
      await invalidateCustomerAccountSecurity(tx, account.id, new Date());
    }

    return tx.customer.delete({ where: { id } });
  });
}

export async function setCustomerAccountStatus(
  customerId: string,
  status: "ACTIVE" | "SUSPENDED",
) {
  return prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customerId);
    const account = await lockCustomerAccount(tx, customerId);
    if (!account) throw new CustomerLifecycleError("ACCOUNT_NOT_FOUND");

    if (status === "SUSPENDED") {
      await invalidateCustomerAccountSecurity(tx, account.id, new Date());
    }

    return tx.customerAccount.update({
      where: { id: account.id },
      data: { status },
      select: customerAccountStatusSelect,
    });
  });
}

export async function deleteCustomerAccount(customerId: string) {
  return prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customerId);
    const account = await lockCustomerAccount(tx, customerId);
    if (!account) throw new CustomerLifecycleError("ACCOUNT_NOT_FOUND");

    await invalidateCustomerAccountSecurity(tx, account.id, new Date());
    await tx.customerAccount.delete({ where: { id: account.id } });
  });
}

export async function anonymizeCustomer(customerId: string) {
  return prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customerId);
    const account = await lockCustomerAccount(tx, customerId);

    if (account) {
      await invalidateCustomerAccountSecurity(tx, account.id, new Date());
      await tx.customerAccount.delete({ where: { id: account.id } });
    }

    return tx.customer.update({
      where: { id: customerId },
      data: {
        name: `Cliente anonimizado (${customerId.slice(0, 8)})`,
        email: null,
        phone: null,
        document: null,
        address: null,
      },
      include: customerWithAccount,
    });
  });
}
