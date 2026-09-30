import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import {
  createFixtureCustomer,
  createFixtureServiceOrder,
  createFixtureUser,
  FIXTURE_PASSWORD,
} from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("TECHNICIAN — Customers no escopo operacional", () => {
  it("cria Customer sem criar User ou vínculo de conta", async () => {
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const session = await loginAs(app, technician.email, FIXTURE_PASSWORD);

    const response = await request(app)
      .post("/customers")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Cliente presencial", email: "presencial@example.com" });

    expect(response.status).toBe(201);
    const customer = await testPrisma.customer.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(customer.userId).toBeNull();
    expect(await testPrisma.user.count()).toBe(1);
  });

  it("só lista e consulta Customers com ordens atribuídas ao próprio técnico", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: technicianA } = await createFixtureUser("TECHNICIAN");
    const { user: technicianB } = await createFixtureUser("TECHNICIAN");
    const visibleCustomer = await createFixtureCustomer({ name: "Cliente da fila A" });
    const hiddenCustomer = await createFixtureCustomer({ name: "Cliente da fila B" });

    await createFixtureServiceOrder({
      customerId: visibleCustomer.id,
      createdById: admin.id,
      technicianId: technicianA.id,
    });
    await createFixtureServiceOrder({
      customerId: hiddenCustomer.id,
      createdById: admin.id,
      technicianId: technicianB.id,
    });

    const session = await loginAs(app, technicianA.email, FIXTURE_PASSWORD);
    const list = await request(app).get("/customers").set("Cookie", session.cookie);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(visibleCustomer.id);

    const own = await request(app).get(`/customers/${visibleCustomer.id}`).set("Cookie", session.cookie);
    expect(own.status).toBe(200);

    const other = await request(app).get(`/customers/${hiddenCustomer.id}`).set("Cookie", session.cookie);
    expect(other.status).toBe(404);
  });

  it("não recebe permissão de editar Customer", async () => {
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, technician.email, FIXTURE_PASSWORD);

    const response = await request(app)
      .patch(`/customers/${customer.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Tentativa indevida" });

    expect(response.status).toBe(403);
  });
});
