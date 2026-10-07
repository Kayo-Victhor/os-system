import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});

import app from "../src/app.js";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock.js";
import { authAs } from "./helpers/auth.js";

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const TECHNICIAN_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  resetPrismaMock();
});

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    title: "Consertar impressora",
    description: "Impressora não liga",
    status: "OPEN",
    priority: "MEDIUM",
    customerId: CUSTOMER_ID,
    technicianId: null,
    createdById: "staff-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("POST /service-orders", () => {
  it("rejects unauthenticated create", async () => {
    const res = await request(app).post("/service-orders").send({
      title: "Consertar impressora",
      description: "Impressora não liga",
      customerId: CUSTOMER_ID,
    });

    expect(res.status).toBe(401);
  });

  it("creates an order with a valid session", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "ATTENDANT");

    prismaMock.customer.findUnique.mockResolvedValueOnce({ id: CUSTOMER_ID });
    prismaMock.serviceOrder.create.mockResolvedValueOnce(makeOrder());

    const res = await request(app)
      .post("/service-orders")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({
        title: "Consertar impressora",
        description: "Impressora não liga",
        customerId: CUSTOMER_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(ORDER_ID);
  });

  it("rejects an invalid customerId format", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "ATTENDANT");

    const res = await request(app)
      .post("/service-orders")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({
        title: "Consertar impressora",
        description: "Impressora não liga",
        customerId: "not-a-uuid",
      });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /service-orders/:id/status — technician ownership", () => {
  it("allows a technician to update the status of their own order", async () => {
    const { cookie, csrfHeader } = authAs("tech-1", "TECHNICIAN");

    prismaMock.serviceOrder.findFirst
      .mockResolvedValueOnce(makeOrder({ technicianId: "tech-1" }))
      .mockResolvedValueOnce(makeOrder({ technicianId: "tech-1", status: "IN_PROGRESS" }));
    prismaMock.serviceOrder.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .patch(`/service-orders/${ORDER_ID}/status`)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(200);
    expect(prismaMock.serviceOrder.updateMany).toHaveBeenCalled();
  });

  it("blocks a technician from updating an order assigned to someone else", async () => {
    const { cookie, csrfHeader } = authAs("tech-1", "TECHNICIAN");

    prismaMock.serviceOrder.findFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .patch(`/service-orders/${ORDER_ID}/status`)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(404);
    expect(prismaMock.serviceOrder.updateMany).not.toHaveBeenCalled();
  });

  it("blocks a technician from updating an unassigned order", async () => {
    const { cookie, csrfHeader } = authAs("tech-1", "TECHNICIAN");

    prismaMock.serviceOrder.findFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .patch(`/service-orders/${ORDER_ID}/status`)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(404);
  });

  it("allows an ADMIN to update the status of any order", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.serviceOrder.findFirst
      .mockResolvedValueOnce(makeOrder({ technicianId: "tech-2" }))
      .mockResolvedValueOnce(makeOrder({ technicianId: "tech-2", status: "IN_PROGRESS" }));
    prismaMock.serviceOrder.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .patch(`/service-orders/${ORDER_ID}/status`)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(200);
  });

  it("returns 404 for a non-existent order", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");
    prismaMock.serviceOrder.findFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .patch(`/service-orders/${ORDER_ID}/status`)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /service-orders/:id/technician — assignment", () => {
  it("a TECHNICIAN cannot assign technicians (lacks OS_ASSIGN)", async () => {
    const { cookie, csrfHeader } = authAs("tech-1", "TECHNICIAN");

    const res = await request(app)
      .patch(`/service-orders/${ORDER_ID}/technician`)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ technicianId: "tech-1" });

    expect(res.status).toBe(403);
  });

  it("ADMIN can assign a valid technician", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(makeOrder());
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: TECHNICIAN_ID,
      role: "TECHNICIAN",
    });
    prismaMock.serviceOrder.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.serviceOrder.findFirst.mockResolvedValueOnce(
      makeOrder({ technicianId: TECHNICIAN_ID }),
    );

    const res = await request(app)
      .patch(`/service-orders/${ORDER_ID}/technician`)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ technicianId: TECHNICIAN_ID });

    expect(res.status).toBe(200);
  });

  it("rejects assigning a user who is not a TECHNICIAN", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(makeOrder());
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      role: "ATTENDANT",
    });

    const res = await request(app)
      .patch(`/service-orders/${ORDER_ID}/technician`)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ technicianId: "33333333-3333-4333-8333-333333333333" });

    expect(res.status).toBe(400);
    expect(prismaMock.serviceOrder.updateMany).not.toHaveBeenCalled();
  });
});
