import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});

import {
  createProxySignature,
  PROXY_CLIENT_IP_HEADER,
  PROXY_SIGNATURE_HEADER,
  PROXY_TIMESTAMP_HEADER,
} from "../src/lib/proxy-signature.js";

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  INTERNAL_PROXY_SECRET: process.env.INTERNAL_PROXY_SECRET,
  ALLOW_DIRECT_API_REQUESTS: process.env.ALLOW_DIRECT_API_REQUESTS,
};

const proxySecret = "test-internal-proxy-secret-with-at-least-32-bytes";

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function signedHeaders(input: {
  method?: string;
  pathAndQuery: string;
  clientIp?: string;
  timestamp?: string;
}) {
  const timestamp = input.timestamp ?? String(Date.now());
  const clientIp = input.clientIp ?? "203.0.113.25";
  const method = input.method ?? "GET";
  return {
    [PROXY_CLIENT_IP_HEADER]: clientIp,
    [PROXY_TIMESTAMP_HEADER]: timestamp,
    [PROXY_SIGNATURE_HEADER]: createProxySignature(proxySecret, {
      timestamp,
      method,
      pathAndQuery: input.pathAndQuery,
      clientIp,
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
  process.env.NODE_ENV = "production";
  process.env.CORS_ORIGIN = "https://frontend.example.com";
  process.env.INTERNAL_PROXY_SECRET = proxySecret;
  delete process.env.ALLOW_DIRECT_API_REQUESTS;
});

afterEach(() => {
  restoreEnvironment();
});

describe("fronteira autenticada Vercel → Render", () => {
  it("falha fechada na inicialização de produção sem segredo", async () => {
    delete process.env.INTERNAL_PROXY_SECRET;
    await expect(import("../src/app.js")).rejects.toThrow("INTERNAL_PROXY_SECRET");
  });

  it("mantém /health acessível sem assinatura", async () => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
  });

  it("nega acesso direto às rotas da API em produção", async () => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app).get("/auth/me");
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Acesso não permitido" });
  });

  it("nega também preflight direto sem assinatura", async () => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app)
      .options("/auth/login")
      .set("Origin", "https://frontend.example.com")
      .set("Access-Control-Request-Method", "POST");
    expect(response.status).toBe(403);
  });

  it("aceita uma requisição assinada válida", async () => {
    const { default: app } = await import("../src/app.js");
    const path = "/auth/me?view=compact";
    const response = await request(app).get(path).set(signedHeaders({ pathAndQuery: path }));
    expect(response.status).toBe(401);
  });

  it("nega assinatura incorreta e headers internos injetados", async () => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app)
      .get("/auth/me")
      .set(PROXY_CLIENT_IP_HEADER, "203.0.113.25")
      .set(PROXY_TIMESTAMP_HEADER, String(Date.now()))
      .set(PROXY_SIGNATURE_HEADER, "a".repeat(64));
    expect(response.status).toBe(403);
  });

  it("nega timestamp expirado", async () => {
    const { default: app } = await import("../src/app.js");
    const path = "/auth/me";
    const timestamp = String(Date.now() - 61_000);
    const response = await request(app)
      .get(path)
      .set(signedHeaders({ pathAndQuery: path, timestamp }));
    expect(response.status).toBe(403);
  });

  it("nega método alterado depois da assinatura", async () => {
    const { default: app } = await import("../src/app.js");
    const path = "/auth/forgot-password";
    const response = await request(app)
      .post(path)
      .set(signedHeaders({ method: "GET", pathAndQuery: path }))
      .send({ email: "alguem@example.com" });
    expect(response.status).toBe(403);
  });

  it("nega IP alterado depois da assinatura", async () => {
    const { default: app } = await import("../src/app.js");
    const path = "/auth/me";
    const headers = signedHeaders({ pathAndQuery: path, clientIp: "203.0.113.25" });
    headers[PROXY_CLIENT_IP_HEADER] = "203.0.113.26";

    const response = await request(app).get(path).set(headers);
    expect(response.status).toBe(403);
  });

  it.each([
    ["caminho", "/auth/me", "/auth/customer/me"],
    ["query", "/auth/me?view=one", "/auth/me?view=two"],
  ])("nega %s alterado depois da assinatura", async (_case, signedPath, requestedPath) => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app)
      .get(requestedPath)
      .set(signedHeaders({ pathAndQuery: signedPath }));
    expect(response.status).toBe(403);
  });

  it("não permite que X-Forwarded-For ou X-Real-IP criem contadores distintos", async () => {
    const { default: app } = await import("../src/app.js");
    const path = "/auth/forgot-password";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post(path)
        .set(signedHeaders({ method: "POST", pathAndQuery: path }))
        .set("X-Forwarded-For", `198.51.100.${attempt + 1}`)
        .set("X-Real-IP", `192.0.2.${attempt + 1}`)
        .send({ email: "limite-proxy@example.com" });
      expect(response.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post(path)
      .set(signedHeaders({ method: "POST", pathAndQuery: path }))
      .set("X-Forwarded-For", "198.51.100.250")
      .set("X-Real-IP", "192.0.2.250")
      .send({ email: "limite-proxy@example.com" });
    expect(blocked.status).toBe(429);
  });
});
