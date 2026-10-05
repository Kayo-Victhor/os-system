import { beforeEach, describe, expect, it } from "vitest";

import { bootstrapPrimaryAdmin } from "../../src/services/admin-bootstrap.service.js";
import { verifyPassword } from "../../src/lib/password.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import { createFixtureUser } from "../helpers/fixtures.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("bootstrap do administrador principal", () => {
  it("cria o primeiro ADMIN como principal sem confirmação de e-mail", async () => {
    const admin = await bootstrapPrimaryAdmin(testPrisma.user, {
      email: "principal@example.com",
      password: "senha-principal123",
    });

    expect(admin.role).toBe("ADMIN");
    expect(admin.isPrimaryAdmin).toBe(true);
    expect(admin.emailVerifiedAt).toBeNull();
    expect(await verifyPassword(admin.password, "senha-principal123")).toBe(true);
  });

  it("é idempotente e preserva o id ao atualizar e-mail e senha", async () => {
    const first = await bootstrapPrimaryAdmin(testPrisma.user, {
      email: "principal@example.com",
      password: "senha-principal123",
    });
    const updated = await bootstrapPrimaryAdmin(testPrisma.user, {
      email: "novo-principal@example.com",
      password: "senha-nova-principal123",
    });

    expect(updated.id).toBe(first.id);
    expect(updated.email).toBe("novo-principal@example.com");
    expect(updated.isPrimaryAdmin).toBe(true);
    expect(await verifyPassword(updated.password, "senha-nova-principal123")).toBe(true);
    expect(await testPrisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });

  it("promove o bootstrap legado sem recriar o User", async () => {
    const { user: legacy } = await createFixtureUser("ADMIN", {
      email: "admin@os-system.local",
    });

    const promoted = await bootstrapPrimaryAdmin(testPrisma.user, {
      email: "principal@example.com",
      password: "senha-principal123",
    });

    expect(promoted.id).toBe(legacy.id);
    expect(promoted.email).toBe("principal@example.com");
    expect(promoted.isPrimaryAdmin).toBe(true);
  });

  it("falha quando o e-mail configurado pertence a outra conta", async () => {
    await bootstrapPrimaryAdmin(testPrisma.user, {
      email: "principal@example.com",
      password: "senha-principal123",
    });
    await createFixtureUser("ATTENDANT", { email: "ocupado@example.com" });

    await expect(bootstrapPrimaryAdmin(testPrisma.user, {
      email: "ocupado@example.com",
      password: "senha-principal123",
    })).rejects.toThrow("ADMIN_EMAIL já pertence a outra conta");
  });

  it("falha quando há administradores sem principal identificável", async () => {
    await createFixtureUser("ADMIN", { email: "admin-manual@example.com" });

    await expect(bootstrapPrimaryAdmin(testPrisma.user, {
      email: "principal@example.com",
      password: "senha-principal123",
    })).rejects.toThrow("Não foi possível identificar com segurança");
  });

  it("impede dois administradores principais no banco", async () => {
    await createFixtureUser("ADMIN", { isPrimaryAdmin: true });

    await expect(createFixtureUser("ADMIN", { isPrimaryAdmin: true })).rejects.toThrow();
  });
});
