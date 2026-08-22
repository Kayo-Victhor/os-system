import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});

import app from "../src/app.js";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock.js";
import { authAs } from "./helpers/auth.js";

beforeEach(() => {
  resetPrismaMock();
});

const validCustomer = {
  name: "Maria Souza",
  email: "maria@example.com",
  phone: "11999998888",
  document: "12345678900",
};

describe("Authentication and CSRF are required for mutations", () => {
  it("rejects unauthenticated create", async () => {
    const res = await request(app).post("/customers").send(validCustomer);
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated request missing the CSRF header", async () => {
    const { cookie } = authAs("staff-1", "USER");

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .send(validCustomer);

    expect(res.status).toBe(403);
  });
});

describe("POST /customers", () => {
  it("creates a customer with a valid session + CSRF token", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "USER");

    prismaMock.customer.create.mockResolvedValueOnce({
      id: "cust-1",
      ...validCustomer,
      address: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send(validCustomer);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("cust-1");
  });

  it("rejects invalid input", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "USER");

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ name: "a" }); // too short

    expect(res.status).toBe(400);
    expect(prismaMock.customer.create).not.toHaveBeenCalled();
  });

  it("returns 409 on a duplicate document instead of a raw 500", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "USER");

    prismaMock.customer.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["document"] },
        name: "PrismaClientKnownRequestError",
      }),
    );

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send(validCustomer);

    expect(res.status).toBe(409);
  });

  it("a TECHNICIAN cannot create customers (lacks CUSTOMER_CREATE)", async () => {
    const { cookie, csrfHeader } = authAs("tech-1", "TECHNICIAN");

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send(validCustomer);

    expect(res.status).toBe(403);
    expect(prismaMock.customer.create).not.toHaveBeenCalled();
  });
});

describe("GET /customers/:id", () => {
  it("returns 404 for a non-existent customer", async () => {
    const { cookie } = authAs("staff-1", "USER");
    prismaMock.customer.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .get("/customers/does-not-exist")
      .set("Cookie", cookie);

    expect(res.status).toBe(404);
  });
});

describe("DELETE /customers/:id", () => {
  it("a USER cannot delete customers (lacks CUSTOMER_DELETE)", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "USER");

    const res = await request(app)
      .delete("/customers/cust-1")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader);

    expect(res.status).toBe(403);
    expect(prismaMock.customer.delete).not.toHaveBeenCalled();
  });

  it("an ADMIN can delete an existing customer", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.customer.findUnique.mockResolvedValueOnce({ id: "cust-1" });
    prismaMock.customer.delete.mockResolvedValueOnce({ id: "cust-1" });

    const res = await request(app)
      .delete("/customers/cust-1")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader);

    expect(res.status).toBe(204);
  });
});
