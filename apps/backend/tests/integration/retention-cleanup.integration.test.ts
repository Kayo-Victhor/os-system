import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "../../src/lib/password.js";
import {
  loginCustomerAccount,
  refreshCustomerSession,
  revokeCustomerSession,
} from "../../src/services/customer-auth.service.js";
import { requestCustomerAccountPasswordReset } from "../../src/services/customer-password-reset.service.js";
import {
  confirmCustomerRegistration,
  requestCustomerRegistration,
  resendCustomerRegistration,
} from "../../src/services/customer-registration.service.js";
import { runRetentionCleanupBatch } from "../../src/services/retention-cleanup.service.js";
import {
  isRetentionCleanupWorkerRunning,
  startRetentionCleanupWorker,
  stopRetentionCleanupWorker,
} from "../../src/services/retention-cleanup.worker.js";
import { createFixtureCustomer, createFixtureUser } from "../helpers/fixtures.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

const CUSTOMER_PASSWORD = "senha-retencao-123";
const originalEnv = { ...process.env };

function tokenHash() {
  return randomUUID().replaceAll("-", "");
}

async function createCustomerAccount(email: string) {
  const customer = await createFixtureCustomer({ email });
  return testPrisma.customerAccount.create({
    data: {
      customerId: customer.id,
      email,
      passwordHash: await hashPassword(CUSTOMER_PASSWORD),
      emailVerifiedAt: new Date(),
    },
  });
}

beforeEach(async () => {
  process.env = { ...originalEnv, NODE_ENV: "test" };
  await resetDatabase();
});

afterEach(async () => {
  await stopRetentionCleanupWorker();
  process.env = { ...originalEnv };
});

describe("limpeza automática por retenção", () => {
  it("remove somente registros além da janela e informa contagens auditáveis", async () => {
    const now = new Date("2026-10-08T15:00:00.000Z");
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1_000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1_000);
    const recently = new Date(now.getTime() - 30 * 60 * 1_000);
    const future = new Date(now.getTime() + 60 * 60 * 1_000);

    const activePending = await testPrisma.pendingCustomerRegistration.create({
      data: {
        name: "Cadastro ativo",
        email: "cadastro.ativo@example.com",
        passwordHash: "hash-ativo",
        expiresAt: future,
        verificationToken: {
          create: { tokenHash: tokenHash(), expiresAt: future },
        },
      },
    });
    const activePendingStaleToken =
      await testPrisma.pendingCustomerRegistration.create({
        data: {
          name: "Token expirado",
          email: "token.expirado@example.com",
          passwordHash: "hash-token-expirado",
          expiresAt: future,
          verificationToken: {
            create: { tokenHash: tokenHash(), expiresAt: twoHoursAgo },
          },
        },
      });
    await testPrisma.pendingCustomerRegistration.create({
      data: {
        name: "Cadastro expirado",
        email: "cadastro.expirado@example.com",
        passwordHash: "hash-expirado",
        expiresAt: twoHoursAgo,
        verificationToken: {
          create: { tokenHash: tokenHash(), expiresAt: future },
        },
      },
    });

    const staleAccount = await createCustomerAccount("reset.antigo@example.com");
    const consumedAccount = await createCustomerAccount("reset.usado@example.com");
    const activeAccount = await createCustomerAccount("reset.ativo@example.com");
    await testPrisma.customerAccountPasswordResetToken.create({
      data: {
        customerAccountId: staleAccount.id,
        tokenHash: tokenHash(),
        expiresAt: twoDaysAgo,
      },
    });
    await testPrisma.customerAccountPasswordResetToken.create({
      data: {
        customerAccountId: consumedAccount.id,
        tokenHash: tokenHash(),
        expiresAt: future,
        usedAt: twoDaysAgo,
      },
    });
    const activeCustomerReset =
      await testPrisma.customerAccountPasswordResetToken.create({
        data: {
          customerAccountId: activeAccount.id,
          tokenHash: tokenHash(),
          expiresAt: future,
          usedAt: recently,
        },
      });

    const staleSession = await testPrisma.customerSession.create({
      data: {
        customerAccountId: staleAccount.id,
        expiresAt: twoDaysAgo,
        refreshTokens: {
          create: [
            { tokenHash: tokenHash(), expiresAt: twoDaysAgo, consumedAt: twoDaysAgo },
            { tokenHash: tokenHash(), expiresAt: twoDaysAgo },
          ],
        },
      },
    });
    const activeSession = await testPrisma.customerSession.create({
      data: {
        customerAccountId: activeAccount.id,
        expiresAt: future,
        refreshTokens: {
          create: { tokenHash: tokenHash(), expiresAt: future, consumedAt: recently },
        },
      },
    });
    await testPrisma.customerSession.create({
      data: {
        customerAccountId: staleAccount.id,
        expiresAt: twoDaysAgo,
        revokedAt: twoDaysAgo,
        refreshTokens: {
          create: { tokenHash: tokenHash(), expiresAt: twoDaysAgo },
        },
      },
    });
    const recentlyRevokedSession = await testPrisma.customerSession.create({
      data: {
        customerAccountId: activeAccount.id,
        expiresAt: twoDaysAgo,
        revokedAt: recently,
        refreshTokens: {
          create: { tokenHash: tokenHash(), expiresAt: twoDaysAgo },
        },
      },
    });

    const { user: staleUser } = await createFixtureUser("ATTENDANT");
    const { user: consumedUser } = await createFixtureUser("ATTENDANT");
    const { user: activeUser } = await createFixtureUser("TECHNICIAN");
    await testPrisma.passwordResetToken.create({
      data: {
        userId: staleUser.id,
        tokenHash: tokenHash(),
        expiresAt: twoDaysAgo,
      },
    });
    await testPrisma.passwordResetToken.create({
      data: {
        userId: consumedUser.id,
        tokenHash: tokenHash(),
        expiresAt: future,
        usedAt: twoDaysAgo,
      },
    });
    const activeInternalReset = await testPrisma.passwordResetToken.create({
      data: {
        userId: activeUser.id,
        tokenHash: tokenHash(),
        expiresAt: future,
        usedAt: recently,
      },
    });
    await testPrisma.refreshToken.create({
      data: {
        userId: staleUser.id,
        tokenHash: tokenHash(),
        expiresAt: twoDaysAgo,
        revokedAt: twoDaysAgo,
      },
    });
    const activeInternalRefresh = await testPrisma.refreshToken.create({
      data: {
        userId: activeUser.id,
        tokenHash: tokenHash(),
        expiresAt: future,
        revokedAt: twoDaysAgo,
      },
    });
    const outbox = await testPrisma.emailOutbox.create({
      data: {
        type: "INTERNAL_PASSWORD_RESET",
        recipient: "outbox.preservada@example.com",
        payload: {},
        deduplicationKey: tokenHash(),
        relatedEntityId: activeInternalReset.id,
      },
    });

    const removed = await runRetentionCleanupBatch({ now, batchSize: 100 });

    expect(removed).toEqual({
      pendingRegistrations: 1,
      confirmationTokens: 2,
      customerPasswordResetTokens: 2,
      customerSessions: 2,
      customerSessionRefreshTokens: 3,
      internalRefreshTokens: 1,
      internalPasswordResetTokens: 2,
    });
    expect(await testPrisma.pendingCustomerRegistration.findUnique({
      where: { id: activePending.id },
    })).not.toBeNull();
    expect(await testPrisma.pendingCustomerRegistration.findUnique({
      where: { id: activePendingStaleToken.id },
    })).not.toBeNull();
    expect(await testPrisma.pendingCustomerRegistrationToken.findUnique({
      where: { pendingRegistrationId: activePendingStaleToken.id },
    })).toBeNull();
    expect(await testPrisma.customerAccountPasswordResetToken.findUnique({
      where: { id: activeCustomerReset.id },
    })).not.toBeNull();
    expect(await testPrisma.customerSession.findUnique({
      where: { id: staleSession.id },
    })).toBeNull();
    expect(await testPrisma.customerSession.findUnique({
      where: { id: activeSession.id },
    })).not.toBeNull();
    expect(await testPrisma.customerSession.findUnique({
      where: { id: recentlyRevokedSession.id },
    })).not.toBeNull();
    expect(await testPrisma.passwordResetToken.findUnique({
      where: { id: activeInternalReset.id },
    })).not.toBeNull();
    expect(await testPrisma.refreshToken.findUnique({
      where: { id: activeInternalRefresh.id },
    })).not.toBeNull();
    expect(await testPrisma.emailOutbox.findUnique({ where: { id: outbox.id } })).not.toBeNull();

    expect(await runRetentionCleanupBatch({ now, batchSize: 100 })).toEqual({
      pendingRegistrations: 0,
      confirmationTokens: 0,
      customerPasswordResetTokens: 0,
      customerSessions: 0,
      customerSessionRefreshTokens: 0,
      internalRefreshTokens: 0,
      internalPasswordResetTokens: 0,
    });
  });

  it("respeita o limite do lote e é segura com ciclos concorrentes", async () => {
    const now = new Date("2026-10-08T15:00:00.000Z");
    const old = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1_000);
    const { user } = await createFixtureUser("ATTENDANT");
    await testPrisma.refreshToken.createMany({
      data: Array.from({ length: 7 }, () => ({
        userId: user.id,
        tokenHash: tokenHash(),
        expiresAt: old,
      })),
    });

    const first = await runRetentionCleanupBatch({ now, batchSize: 2 });
    expect(first.internalRefreshTokens).toBe(2);
    expect(await testPrisma.refreshToken.count()).toBe(5);

    const concurrent = await Promise.all([
      runRetentionCleanupBatch({ now, batchSize: 10 }),
      runRetentionCleanupBatch({ now, batchSize: 10 }),
    ]);
    expect(concurrent.reduce(
      (sum, result) => sum + result.internalRefreshTokens,
      0,
    )).toBe(5);
    expect(await testPrisma.refreshToken.count()).toBe(0);
  });

  it("preserva ancestrais consumidos enquanto a sessão pode detectar reutilização", async () => {
    const account = await createCustomerAccount("replay.retencao@example.com");
    const login = await loginCustomerAccount({
      email: account.email,
      password: CUSTOMER_PASSWORD,
    });
    expect(login).not.toBeNull();

    const rotated = await refreshCustomerSession(login!.refreshToken);
    expect(rotated).not.toBeNull();
    const beforeCleanup = await testPrisma.customerSessionRefreshToken.count();
    expect(beforeCleanup).toBe(2);

    const removed = await runRetentionCleanupBatch({
      now: new Date(),
      batchSize: 100,
    });
    expect(removed.customerSessions).toBe(0);
    expect(removed.customerSessionRefreshTokens).toBe(0);
    expect(await testPrisma.customerSessionRefreshToken.count()).toBe(2);

    expect(await refreshCustomerSession(login!.refreshToken)).toBeNull();
    expect((await testPrisma.customerSession.findFirstOrThrow()).revokedAt).not.toBeNull();
    expect(await refreshCustomerSession(rotated!.refreshToken)).toBeNull();
  });

  it("convive com registro, confirmação, reenvio, reset e refresh concorrentes", async () => {
    const confirmEmail = "confirmar.concorrente@example.com";
    const resendEmail = "reenviar.concorrente@example.com";
    await requestCustomerRegistration({
      name: "Confirmar Concorrente",
      email: confirmEmail,
      password: CUSTOMER_PASSWORD,
    });
    await requestCustomerRegistration({
      name: "Reenviar Concorrente",
      email: resendEmail,
      password: CUSTOMER_PASSWORD,
    });
    const confirmationEvent = await testPrisma.emailOutbox.findFirstOrThrow({
      where: {
        recipient: confirmEmail,
        type: "CUSTOMER_REGISTRATION_VERIFICATION",
        status: "PENDING",
      },
    });
    const confirmationPayload = confirmationEvent.payload as { token?: unknown };
    if (typeof confirmationPayload.token !== "string") {
      throw new Error("Fixture sem token de confirmação");
    }
    const resetAccount = await createCustomerAccount("forgot.concorrente@example.com");
    const refreshAccount = await createCustomerAccount("refresh.concorrente@example.com");
    const login = await loginCustomerAccount({
      email: refreshAccount.email,
      password: CUSTOMER_PASSWORD,
    });
    expect(login).not.toBeNull();

    const [, confirmation] = await Promise.all([
      runRetentionCleanupBatch(),
      confirmCustomerRegistration(confirmationPayload.token),
    ]);
    expect(confirmation).toBe("CONFIRMED");
    expect(await testPrisma.customerAccount.findUnique({
      where: { email: confirmEmail },
    })).not.toBeNull();

    const [, resent] = await Promise.all([
      runRetentionCleanupBatch(),
      resendCustomerRegistration(resendEmail),
    ]);
    expect(resent).toBe(true);
    expect(await testPrisma.pendingCustomerRegistrationToken.findFirst({
      where: { pendingRegistration: { email: resendEmail } },
    })).not.toBeNull();

    const [, resetRequested] = await Promise.all([
      runRetentionCleanupBatch(),
      requestCustomerAccountPasswordReset(resetAccount.email),
    ]);
    expect(resetRequested).toBe(true);
    expect(await testPrisma.customerAccountPasswordResetToken.findUnique({
      where: { customerAccountId: resetAccount.id },
    })).not.toBeNull();

    const [, refreshed] = await Promise.all([
      runRetentionCleanupBatch(),
      refreshCustomerSession(login!.refreshToken),
    ]);
    expect(refreshed).not.toBeNull();
    expect(await testPrisma.customerSession.count({
      where: { customerAccountId: refreshAccount.id, revokedAt: null },
    })).toBe(1);

    await Promise.all([
      runRetentionCleanupBatch(),
      revokeCustomerSession({ refreshToken: refreshed!.refreshToken }),
    ]);
    expect((await testPrisma.customerSession.findFirstOrThrow({
      where: { customerAccountId: refreshAccount.id },
    })).revokedAt).not.toBeNull();
  });

  it("não inicia automaticamente em testes e encerra uma única instância", async () => {
    startRetentionCleanupWorker();
    expect(isRetentionCleanupWorkerRunning()).toBe(false);

    process.env.NODE_ENV = "development";
    process.env.CLEANUP_POLL_INTERVAL_MS = "10000";
    startRetentionCleanupWorker();
    startRetentionCleanupWorker();
    expect(isRetentionCleanupWorkerRunning()).toBe(true);

    await stopRetentionCleanupWorker();
    expect(isRetentionCleanupWorkerRunning()).toBe(false);
  });

  it("preserva RLS e não cria grants públicos nas tabelas limpas", async () => {
    const tables = [
      "RefreshToken",
      "PasswordResetToken",
      "CustomerSession",
      "CustomerSessionRefreshToken",
      "CustomerAccountPasswordResetToken",
      "PendingCustomerRegistration",
      "PendingCustomerRegistrationToken",
    ];
    const rls = await testPrisma.$queryRaw<Array<{
      relname: string;
      relrowsecurity: boolean;
    }>>`
      SELECT "relname", "relrowsecurity"
      FROM "pg_class"
      WHERE "oid" = ANY(ARRAY[
        'public."RefreshToken"'::regclass,
        'public."PasswordResetToken"'::regclass,
        'public."CustomerSession"'::regclass,
        'public."CustomerSessionRefreshToken"'::regclass,
        'public."CustomerAccountPasswordResetToken"'::regclass,
        'public."PendingCustomerRegistration"'::regclass,
        'public."PendingCustomerRegistrationToken"'::regclass
      ])
    `;
    const grants = await testPrisma.$queryRaw<Array<{
      table_name: string;
      grantee: string;
    }>>`
      SELECT "table_name", "grantee"
      FROM "information_schema"."role_table_grants"
      WHERE "table_schema" = 'public'
        AND "table_name" = ANY(${tables})
        AND "grantee" IN ('anon', 'authenticated')
    `;

    expect(rls).toHaveLength(tables.length);
    expect(rls.every(({ relrowsecurity }) => relrowsecurity)).toBe(true);
    expect(grants).toEqual([]);
  });
});
