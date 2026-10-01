import { beforeEach, describe, expect, it, vi } from "vitest";
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

const customerPayload = {
  name: "Maria Souza",
  email: "maria@example.com",
  phone: "11999998888",
  document: "12345678900",
};

function accessCookie() {
  return authAs("admin-1", "ADMIN").cookie.split("; ")[0];
}

describe("CSRF centralizado para sessões por cookie", () => {
  it("permite GET autenticado sem CSRF", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    });

    const res = await request(app).get("/auth/me").set("Cookie", accessCookie());

    expect(res.status).toBe(200);
  });

  it.each(["post", "patch", "delete"] as const)(
    "mantém 401 para %s sem qualquer cookie de sessão",
    async (method) => {
      const path = method === "post" ? "/customers" : "/customers/customer-1";
      const res = await request(app)[method](path).send(customerPayload);
      expect(res.status).toBe(401);
    },
  );

  it("bloqueia POST com sessão e sem cookie CSRF", async () => {
    const res = await request(app)
      .post("/customers")
      .set("Cookie", accessCookie())
      .send(customerPayload);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Falha na validação CSRF");
  });

  it("bloqueia POST com cookie CSRF e sem header", async () => {
    const { cookie } = authAs("admin-1", "ADMIN");
    const res = await request(app).post("/customers").set("Cookie", cookie).send(customerPayload);

    expect(res.status).toBe(403);
  });

  it("bloqueia PATCH com cookie e header CSRF diferentes", async () => {
    const { cookie } = authAs("admin-1", "ADMIN");
    const res = await request(app)
      .patch("/customers/customer-1")
      .set("Cookie", cookie)
      .set("x-csrf-token", "outro-token")
      .send({ name: "Maria Atualizada" });

    expect(res.status).toBe(403);
  });

  it("permite a requisição seguir quando cookie e header CSRF são idênticos", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");
    prismaMock.customer.create.mockResolvedValueOnce({
      id: "customer-1",
      ...customerPayload,
      address: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send(customerPayload);

    expect(res.status).toBe(201);
    expect(prismaMock.customer.create).toHaveBeenCalledOnce();
  });

  it("bloqueia token CSRF vazio", async () => {
    const { cookie } = authAs("admin-1", "ADMIN");
    const res = await request(app)
      .delete("/customers/customer-1")
      .set("Cookie", cookie)
      .set("x-csrf-token", "");

    expect(res.status).toBe(403);
  });
});

describe("CSRF em refresh e logout", () => {
  it("bloqueia refresh quando refresh_token existe sem CSRF", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "refresh_token=qualquer-token");

    expect(res.status).toBe(403);
  });

  it("permite refresh com CSRF válido alcançar a validação da sessão", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "refresh_token=qualquer-token; csrf_token=csrf-valido")
      .set("x-csrf-token", "csrf-valido");

    expect(res.status).toBe(401);
    expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledOnce();
  });

  it("bloqueia logout com sessão e sem CSRF", async () => {
    const res = await request(app).post("/auth/logout").set("Cookie", accessCookie());
    expect(res.status).toBe(403);
  });

  it("permite logout com CSRF válido", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");
    const res = await request(app)
      .post("/auth/logout")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader);

    expect(res.status).toBe(204);
  });
});
