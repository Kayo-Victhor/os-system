import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { hashPassword } from "../../src/lib/password.js";
import { createFixtureCustomer, createFixtureUser } from "../helpers/fixtures.js";
import { authAs } from "../helpers/auth.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("CustomerAccount — estrutura isolada de acesso do cliente", () => {
  it("permite Customer sem conta e limita cada Customer a uma única conta", async () => {
    const customer = await createFixtureCustomer();

    await expect(testPrisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
      include: { customerAccount: true },
    })).resolves.toMatchObject({ customerAccount: null });

    const account = await testPrisma.customerAccount.create({
      data: {
        customerId: customer.id,
        email: "conta-cliente@example.com",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
      },
    });

    expect(account.status).toBe("ACTIVE");
    expect(account.emailVerifiedAt).toBeNull();

    await expect(testPrisma.customerAccount.create({
      data: {
        customerId: customer.id,
        email: "segunda-conta@example.com",
        passwordHash: "hash-invalido-para-teste-de-constraint",
      },
    })).rejects.toThrow();
  });

  it("impõe Customer existente e e-mail único somente entre CustomerAccount", async () => {
    const customer = await createFixtureCustomer();
    const otherCustomer = await createFixtureCustomer();
    const { user } = await createFixtureUser("ATTENDANT", { email: "mesmo-email@example.com" });

    await testPrisma.customerAccount.create({
      data: {
        customerId: customer.id,
        email: user.email,
        passwordHash: "hash-invalido-para-teste-de-constraint",
      },
    });

    await expect(testPrisma.customerAccount.create({
      data: {
        customerId: otherCustomer.id,
        email: user.email,
        passwordHash: "hash-invalido-para-teste-de-constraint",
      },
    })).rejects.toThrow();

    await expect(testPrisma.customerAccount.create({
      data: {
        customerId: "00000000-0000-0000-0000-000000000000",
        email: "sem-customer@example.com",
        passwordHash: "hash-invalido-para-teste-de-constraint",
      },
    })).rejects.toThrow();
  });

  it("mantém RLS ativa, sem privilégios públicos quando as roles existem", async () => {
    const rowSecurity = await testPrisma.$queryRaw<Array<{ rowSecurity: boolean }>>`
      SELECT c.relrowsecurity AS "rowSecurity"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'CustomerAccount'
    `;
    expect(rowSecurity).toEqual([{ rowSecurity: true }]);

    const pendingRowSecurity = await testPrisma.$queryRaw<Array<{ relname: string; rowSecurity: boolean }>>`
      SELECT c.relname, c.relrowsecurity AS "rowSecurity"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'CustomerAccountPasswordResetToken',
          'PendingCustomerRegistration',
          'PendingCustomerRegistrationToken'
        )
      ORDER BY c.relname
    `;
    expect(pendingRowSecurity).toEqual([
      { relname: "CustomerAccountPasswordResetToken", rowSecurity: true },
      { relname: "PendingCustomerRegistration", rowSecurity: true },
      { relname: "PendingCustomerRegistrationToken", rowSecurity: true },
    ]);

    const roles = await testPrisma.$queryRaw<Array<{ rolname: string }>>`
      SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
    `;
    for (const { rolname } of roles) {
      const privileges = await testPrisma.$queryRaw<Array<{ hasPrivilege: boolean }>>`
        SELECT has_table_privilege(${rolname}, 'public."CustomerAccount"', 'SELECT') AS "hasPrivilege"
      `;
      expect(privileges).toEqual([{ hasPrivilege: false }]);

      for (const table of [
        "CustomerAccountPasswordResetToken",
        "PendingCustomerRegistration",
        "PendingCustomerRegistrationToken",
      ]) {
        const pendingPrivileges = await testPrisma.$queryRawUnsafe<Array<{ hasPrivilege: boolean }>>(
          `SELECT has_table_privilege($1, 'public."${table}"', 'SELECT') AS "hasPrivilege"`,
          rolname,
        );
        expect(pendingPrivileges).toEqual([{ hasPrivilege: false }]);
      }
    }
  });

  it("não expõe passwordHash nas respostas existentes de Customer", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    await testPrisma.customerAccount.create({
      data: {
        customerId: customer.id,
        email: "segredo-nao-exposto@example.com",
        passwordHash: "hash-secreto-que-nao-pode-ser-enviado",
      },
    });

    const session = authAs(admin.id, "ADMIN");
    const response = await request(app)
      .get(`/customers/${customer.id}`)
      .set("Cookie", session.cookie);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("hash-secreto-que-nao-pode-ser-enviado");
    expect(response.body).not.toHaveProperty("customerAccount");
  });
});
