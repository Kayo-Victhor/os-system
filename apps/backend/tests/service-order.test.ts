import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../src/app.js";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock.js";
import { authAs } from "./helpers/auth.js";

beforeEach(() => {
  resetPrismaMock();
});

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "os-1",
    title: "Consertar impressora",
    description: "Impressora não liga",
    status: "OPEN",
    priority: "MEDIUM",
    customerId: "cust-1",
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
      customerId: "cust-1",
    });

    expect(res.status).toBe(401);
  });

  it("creates an order with a valid session", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "USER");

    prismaMock.serviceOrder.create.mockResolvedValueOnce(makeOrder());

    const res = await request(app)
      .post("/service-orders")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({
        title: "Consertar impressora",
        description: "Impressora não liga",
        customerId: "cust-1",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("os-1");
  });

  it("rejects an invalid customerId format", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "USER");

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

    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(
      makeOrder({ technicianId: "tech-1" }),
    );
    prismaMock.serviceOrder.update.mockResolvedValueOnce(
      makeOrder({ technicianId: "tech-1", status: "IN_PROGRESS" }),
    );

    const res = await request(app)
      .patch("/service-orders/os-1/status")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(200);
    expect(prismaMock.serviceOrder.update).toHaveBeenCalled();
  });

  it("blocks a technician from updating an order assigned to someone else", async () => {
    const { cookie, csrfHeader } = authAs("tech-1", "TECHNICIAN");

    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(
      makeOrder({ technicianId: "tech-2" }),
    );

    const res = await request(app)
      .patch("/service-orders/os-1/status")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(403);
    expect(prismaMock.serviceOrder.update).not.toHaveBeenCalled();
  });

  it("blocks a technician from updating an unassigned order", async () => {
    const { cookie, csrfHeader } = authAs("tech-1", "TECHNICIAN");

    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(
      makeOrder({ technicianId: null }),
    );

    const res = await request(app)
      .patch("/service-orders/os-1/status")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(403);
  });

  it("allows an ADMIN to update the status of any order", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(
      makeOrder({ technicianId: "tech-2" }),
    );
    prismaMock.serviceOrder.update.mockResolvedValueOnce(
      makeOrder({ technicianId: "tech-2", status: "COMPLETED" }),
    );

    const res = await request(app)
      .patch("/service-orders/os-1/status")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(200);
  });

  it("returns 404 for a non-existent order", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");
    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .patch("/service-orders/does-not-exist/status")
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
      .patch("/service-orders/os-1/technician")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ technicianId: "tech-1" });

    expect(res.status).toBe(403);
  });

  it("ADMIN can assign a valid technician", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(makeOrder());
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "tech-1",
      role: "TECHNICIAN",
    });
    prismaMock.serviceOrder.update.mockResolvedValueOnce(
      makeOrder({ technicianId: "tech-1" }),
    );

    const res = await request(app)
      .patch("/service-orders/os-1/technician")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ technicianId: "tech-1" });

    expect(res.status).toBe(200);
  });

  it("rejects assigning a user who is not a TECHNICIAN", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.serviceOrder.findUnique.mockResolvedValueOnce(makeOrder());
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "staff-2",
      role: "USER",
    });

    const res = await request(app)
      .patch("/service-orders/os-1/technician")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ technicianId: "staff-2" });

    expect(res.status).toBe(400);
    expect(prismaMock.serviceOrder.update).not.toHaveBeenCalled();
  });
});
