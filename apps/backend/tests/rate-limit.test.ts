import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.resetModules();
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("Rate limit de autenticação", () => {
  it("blocks the eleventh request in the 15-minute window", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app).post("/auth/login").send({ email: "limite@example.com", password: "senha-incorreta" });
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app).post("/auth/login").send({ email: "limite@example.com", password: "senha-incorreta" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain("Muitas tentativas");
  });

  it("blocks the sixth password reset request in the 15-minute window", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post("/auth/forgot-password").send({ email: "limite-reset@example.com" });
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app).post("/auth/forgot-password").send({ email: "limite-reset@example.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain("Muitas tentativas");
  });

  it("blocks the sixth pending customer registration for the same IP and e-mail", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post("/auth/customer/register").send({
        email: "limite-cadastro@example.com",
      });
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app).post("/auth/customer/register").send({
      email: "LIMITE-CADASTRO@example.com",
    });
    expect(blocked.status).toBe(429);
  });

  it("blocks registration spam even when the same IP changes the recipient", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app)
        .post("/auth/customer/register")
        .send({ email: `destinatario-${attempt}@example.com` });
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app)
      .post("/auth/customer/register")
      .send({ email: "destinatario-final@example.com" });
    expect(blocked.status).toBe(429);
  });

  it("blocks the fourth pending registration resend for the same IP and e-mail", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app)
        .post("/auth/customer/register/resend")
        .send({ email: "e-mail-invalido" });
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app)
      .post("/auth/customer/register/resend")
      .send({ email: "e-mail-invalido" });
    expect(blocked.status).toBe(429);
  });

  it("blocks resend spam even when the same IP changes the recipient", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app)
        .post("/auth/customer/register/resend")
        .send({ email: `reenvio-invalido-${attempt}` });
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app)
      .post("/auth/customer/register/resend")
      .send({ email: "reenvio-invalido-final" });
    expect(blocked.status).toBe(429);
  });

  it("blocks the eleventh pending registration confirmation from the same IP", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app)
        .post("/auth/customer/register/confirm")
        .send({ token: "inválido" });
      expect(response.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post("/auth/customer/register/confirm")
      .send({ token: "inválido" });
    expect(blocked.status).toBe(429);
  });

  it("blocks the sixth customer password-reset request from the same IP", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post("/auth/customer/forgot-password")
        .send({ email: "cliente-reset@example.com" });
      expect(response.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post("/auth/customer/forgot-password")
      .send({ email: "cliente-reset@example.com" });
    expect(blocked.status).toBe(429);
  });

  it("blocks the eleventh customer login attempt in the 15-minute window", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app)
        .post("/auth/customer/login")
        .send({});
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app).post("/auth/customer/login").send({});
    expect(blocked.status).toBe(429);
  });
});
