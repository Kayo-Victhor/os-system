import { setTimeout as delay } from "node:timers/promises";

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import {
  createFixtureCustomer,
  createFixtureServiceOrder,
  createFixtureUser,
  FIXTURE_PASSWORD,
} from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function createTrackedOrder(priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" = "MEDIUM") {
  const { user } = await createFixtureUser("ADMIN");
  const customer = await createFixtureCustomer();
  const session = await loginAs(app, user.email, FIXTURE_PASSWORD);
  const response = await request(app)
    .post("/service-orders")
    .set("Cookie", session.cookie)
    .set("x-csrf-token", session.csrfHeader)
    .send({
      title: "SLA com integridade temporal",
      description: "Ordem usada para validar conclusão e concorrência",
      priority,
      customerId: customer.id,
    });
  expect(response.status).toBe(201);
  return { user, customer, session, response };
}

async function transition(
  id: string,
  session: { cookie: string; csrfHeader: string },
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
) {
  return request(app)
    .patch(`/service-orders/${id}/status`)
    .set("Cookie", session.cookie)
    .set("x-csrf-token", session.csrfHeader)
    .send({ status });
}

async function holdServiceOrderRow(id: string) {
  let markLocked!: () => void;
  let releaseLock!: () => void;
  const locked = new Promise<void>((resolve) => {
    markLocked = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  const transaction = testPrisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ServiceOrder" WHERE "id" = ${id} FOR UPDATE`;
    markLocked();
    await released;
  }, { timeout: 10_000 });

  await Promise.race([
    locked,
    transaction.then(() => {
      throw new Error("A transação de teste terminou antes de adquirir o lock");
    }),
  ]);

  return async () => {
    releaseLock();
    await transaction;
  };
}

async function waitForBlockedServiceOrderWrites(expected: number) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const [result] = await testPrisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM pg_stat_activity
      WHERE cardinality(pg_blocking_pids(pid)) > 0
        AND query LIKE '%ServiceOrder%'
    `;
    if ((result?.count ?? 0) >= expected) return;
    await delay(20);
  }
  throw new Error(`Não foram observadas ${expected} escritas bloqueadas em ServiceOrder`);
}

describe("integridade temporal do SLA", () => {
  it("grava completedAt e o evento com o mesmo instante absoluto", async () => {
    const { session, response } = await createTrackedOrder("HIGH");
    expect((await transition(response.body.id, session, "IN_PROGRESS")).status).toBe(200);

    const completed = await transition(response.body.id, session, "COMPLETED");
    expect(completed.status).toBe(200);
    expect(completed.body.completedAt).toMatch(/Z$/);
    expect(completed.body.resolutionDueAt).toMatch(/Z$/);

    const stored = await testPrisma.serviceOrder.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    const event = await testPrisma.serviceOrderEvent.findFirstOrThrow({
      where: {
        serviceOrderId: response.body.id,
        type: "STATUS_CHANGED",
        newStatus: "COMPLETED",
      },
    });
    expect(stored.completedAt).not.toBeNull();
    expect(stored.completedAt?.getTime()).toBe(event.createdAt.getTime());
    expect(stored.completedAt?.toISOString()).toBe(completed.body.completedAt);

    const list = await request(app).get("/service-orders").set("Cookie", session.cookie);
    const detail = await request(app)
      .get(`/service-orders/${response.body.id}`)
      .set("Cookie", session.cookie);
    expect(list.body.items[0].completedAt).toBe(completed.body.completedAt);
    expect(detail.body.completedAt).toBe(completed.body.completedAt);
  });

  it("usa o relógio efetivo do PostgreSQL depois de uma espera por lock", async () => {
    const { session, response } = await createTrackedOrder("HIGH");
    expect((await transition(response.body.id, session, "IN_PROGRESS")).status).toBe(200);

    const release = await holdServiceOrderRow(response.body.id);
    try {
      const completion = transition(response.body.id, session, "COMPLETED");
      await waitForBlockedServiceOrderWrites(1);
      const [beforeRelease] = await testPrisma.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS "now"
      `;
      await release();

      const result = await completion;
      expect(result.status).toBe(200);
      expect(new Date(result.body.completedAt).getTime())
        .toBeGreaterThanOrEqual(beforeRelease.now.getTime());
    } catch (error) {
      await release();
      throw error;
    }
  });

  it("reverte status e completedAt quando o evento de conclusão falha", async () => {
    const { session, response } = await createTrackedOrder();
    expect((await transition(response.body.id, session, "IN_PROGRESS")).status).toBe(200);
    await testPrisma.$executeRawUnsafe(`
      CREATE FUNCTION test_reject_completion_event() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'STATUS_CHANGED' AND NEW."newStatus" = 'COMPLETED' THEN
          RAISE EXCEPTION 'forced completion event failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_completion_event_trigger
      BEFORE INSERT ON "ServiceOrderEvent"
      FOR EACH ROW EXECUTE FUNCTION test_reject_completion_event();
    `);

    try {
      const failed = await transition(response.body.id, session, "COMPLETED");
      expect(failed.status).toBe(500);
      const stored = await testPrisma.serviceOrder.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect(stored.status).toBe("IN_PROGRESS");
      expect(stored.completedAt).toBeNull();
      expect(await testPrisma.serviceOrderEvent.count({
        where: {
          serviceOrderId: response.body.id,
          newStatus: "COMPLETED",
        },
      })).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS test_reject_completion_event_trigger ON "ServiceOrderEvent";
        DROP FUNCTION IF EXISTS test_reject_completion_event();
      `);
    }
  });

  it("reverte a criação, o SLA e a ordem quando o evento CREATED falha", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);
    await testPrisma.$executeRawUnsafe(`
      CREATE FUNCTION test_reject_created_event() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'CREATED' THEN
          RAISE EXCEPTION 'forced created event failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_created_event_trigger
      BEFORE INSERT ON "ServiceOrderEvent"
      FOR EACH ROW EXECUTE FUNCTION test_reject_created_event();
    `);

    try {
      const failed = await request(app)
        .post("/service-orders")
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({
          title: "Não deve persistir",
          description: "Falha de auditoria precisa desfazer a criação",
          priority: "URGENT",
          customerId: customer.id,
        });
      expect(failed.status).toBe(500);
      expect(await testPrisma.serviceOrder.count({
        where: { title: "Não deve persistir" },
      })).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS test_reject_created_event_trigger ON "ServiceOrderEvent";
        DROP FUNCTION IF EXISTS test_reject_created_event();
      `);
    }
  });

  it("mantém conclusão legada sem completedAt como UNTRACKED", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);
    const legacy = await createFixtureServiceOrder({
      customerId: customer.id,
      createdById: user.id,
      status: "COMPLETED",
    });

    const result = await request(app)
      .get(`/service-orders/${legacy.id}`)
      .set("Cookie", session.cookie);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      completedAt: null,
      resolutionSlaStatus: "UNTRACKED",
    });
  });

  it("mantém instantes absolutos com fusos diferentes no processo e na sessão PostgreSQL", async () => {
    const columns = await testPrisma.$queryRaw<Array<{ columnName: string; dataType: string }>>`
      SELECT column_name AS "columnName", data_type AS "dataType"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ServiceOrder'
        AND column_name IN ('resolutionDueAt', 'completedAt')
      ORDER BY column_name
    `;
    expect(columns).toEqual([
      { columnName: "completedAt", dataType: "timestamp with time zone" },
      { columnName: "resolutionDueAt", dataType: "timestamp with time zone" },
    ]);

    const instant = new Date("2026-10-21T18:30:00.123Z");
    const [row] = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
      return tx.$queryRaw<Array<{ instant: Date }>>`
        SELECT ${instant}::timestamptz AS "instant"
      `;
    });
    expect(row.instant.toISOString()).toBe("2026-10-21T18:30:00.123Z");

    const originalTimeZone = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      const { session, response } = await createTrackedOrder("URGENT");
      expect(response.body.createdAt).toMatch(/Z$/);
      expect(response.body.resolutionDueAt).toMatch(/Z$/);
      expect(new Date(response.body.resolutionDueAt).getTime()
        - new Date(response.body.createdAt).getTime()).toBe(240 * 60_000);
      expect((await transition(response.body.id, session, "IN_PROGRESS")).status).toBe(200);
      const completed = await transition(response.body.id, session, "COMPLETED");
      expect(completed.status).toBe(200);
      expect(completed.body.completedAt).toMatch(/Z$/);
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });
});

describe("imutabilidade e concorrência do SLA", () => {
  it.each(["COMPLETED", "CANCELLED"] as const)(
    "recusa prioridade nova após %s, mas permite reenvio idêntico e outras edições",
    async (terminalStatus) => {
      const { session, response } = await createTrackedOrder("MEDIUM");
      if (terminalStatus === "COMPLETED") {
        expect((await transition(response.body.id, session, "IN_PROGRESS")).status).toBe(200);
      }
      expect((await transition(response.body.id, session, terminalStatus)).status).toBe(200);

      const terminal = await testPrisma.serviceOrder.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      const eventCount = await testPrisma.serviceOrderEvent.count({
        where: { serviceOrderId: response.body.id },
      });
      const rejected = await request(app)
        .patch(`/service-orders/${response.body.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ priority: "URGENT" });
      expect(rejected.status).toBe(409);

      const repeated = await request(app)
        .patch(`/service-orders/${response.body.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ priority: "MEDIUM" });
      expect(repeated.status).toBe(200);
      expect(repeated.body.resolutionDueAt).toBe(terminal.resolutionDueAt?.toISOString());
      expect(await testPrisma.serviceOrderEvent.count({
        where: { serviceOrderId: response.body.id },
      })).toBe(eventCount);

      const edited = await request(app)
        .patch(`/service-orders/${response.body.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ title: `Título após ${terminalStatus}` });
      expect(edited.status).toBe(200);
      expect(edited.body.priority).toBe("MEDIUM");
      expect(edited.body.resolutionDueAt).toBe(terminal.resolutionDueAt?.toISOString());
    },
  );

  it("conclui com a meta nova quando a prioridade vence a corrida", async () => {
    const { session, response } = await createTrackedOrder("MEDIUM");
    expect((await transition(response.body.id, session, "IN_PROGRESS")).status).toBe(200);
    const release = await holdServiceOrderRow(response.body.id);

    try {
      const priority = request(app)
        .patch(`/service-orders/${response.body.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ priority: "URGENT" })
        .then((result) => result);
      await waitForBlockedServiceOrderWrites(1);
      const completion = transition(response.body.id, session, "COMPLETED");
      await waitForBlockedServiceOrderWrites(2);
      await release();

      const [priorityResult, completionResult] = await Promise.all([priority, completion]);
      expect(priorityResult.status).toBe(200);
      expect(completionResult.status).toBe(200);
      const stored = await testPrisma.serviceOrder.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect(stored).toMatchObject({
        status: "COMPLETED",
        priority: "URGENT",
        resolutionSlaMinutes: 240,
      });
      expect(stored.completedAt).not.toBeNull();
    } catch (error) {
      await release();
      throw error;
    }
  });

  it.each(["COMPLETED", "CANCELLED"] as const)(
    "retorna 409 para prioridade quando %s vence a corrida",
    async (terminalStatus) => {
      const { session, response } = await createTrackedOrder("MEDIUM");
      if (terminalStatus === "COMPLETED") {
        expect((await transition(response.body.id, session, "IN_PROGRESS")).status).toBe(200);
      }
      const release = await holdServiceOrderRow(response.body.id);

      try {
        const terminal = transition(response.body.id, session, terminalStatus);
        await waitForBlockedServiceOrderWrites(1);
        const priority = request(app)
          .patch(`/service-orders/${response.body.id}`)
          .set("Cookie", session.cookie)
          .set("x-csrf-token", session.csrfHeader)
          .send({ priority: "URGENT" })
          .then((result) => result);
        await waitForBlockedServiceOrderWrites(2);
        await release();

        const [terminalResult, priorityResult] = await Promise.all([terminal, priority]);
        expect(terminalResult.status).toBe(200);
        expect(priorityResult.status).toBe(409);
        const stored = await testPrisma.serviceOrder.findUniqueOrThrow({
          where: { id: response.body.id },
        });
        expect(stored.status).toBe(terminalStatus);
        expect(stored.priority).toBe("MEDIUM");
        expect(stored.resolutionSlaMinutes).toBe(1_440);
        expect(terminalStatus === "COMPLETED" ? stored.completedAt : null)
          .toEqual(terminalStatus === "COMPLETED" ? expect.any(Date) : null);
      } catch (error) {
        await release();
        throw error;
      }
    },
  );
});
