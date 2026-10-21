import assert from "node:assert/strict";
import test from "node:test";

import {
  readSmokeConfiguration,
  runProductionSmoke,
} from "./smoke-production.mjs";

function validEnvironment(overrides = {}) {
  return {
    OS_SYSTEM_FRONTEND_URL: "http://localhost:4173",
    OS_SYSTEM_BACKEND_URL: "http://localhost:4333",
    OS_SYSTEM_SMOKE_TIMEOUT_MS: "1000",
    ...overrides,
  };
}

test("valida origens e rejeita credenciais nas URLs", () => {
  assert.deepEqual(readSmokeConfiguration({}), {
    frontendUrl: "https://os-system-nine.vercel.app",
    backendUrl: "https://os-system-od0v.onrender.com",
    timeoutMs: 30_000,
  });

  assert.deepEqual(readSmokeConfiguration(validEnvironment()), {
    frontendUrl: "http://localhost:4173",
    backendUrl: "http://localhost:4333",
    timeoutMs: 1000,
  });

  assert.throws(
    () => readSmokeConfiguration(validEnvironment({
      OS_SYSTEM_BACKEND_URL: "https://user:secret@example.com",
    })),
    /não pode conter credenciais/,
  );
});

test("executa somente GET sem credenciais e valida os cinco contratos", async () => {
  const responses = [
    new Response("<!doctype html>", { status: 200 }),
    Response.json({ status: "ok", service: "os-system-api" }),
    Response.json({ status: "ok", service: "os-system-api" }),
    Response.json({ error: "Não autenticado" }, { status: 401 }),
    Response.json({ error: "Acesso não permitido" }, { status: 403 }),
  ];
  const requests = [];
  const messages = [];

  const result = await runProductionSmoke({
    environment: validEnvironment(),
    write: (message) => messages.push(message),
    fetchImplementation: async (url, init) => {
      requests.push({ url, init });
      return responses.shift();
    },
  });

  assert.deepEqual(result, { total: 5, passed: 5, failed: 0, exitCode: 0 });
  assert.equal(requests.length, 5);
  assert.deepEqual(requests.map(({ url }) => url), [
    "http://localhost:4173/",
    "http://localhost:4173/api/health",
    "http://localhost:4333/health",
    "http://localhost:4173/api/service-orders",
    "http://localhost:4333/service-orders",
  ]);
  assert.deepEqual(requests.map(({ init }) => init.method), Array(5).fill("GET"));
  assert.equal(requests[0].init.redirect, "follow");
  assert.deepEqual(requests.slice(1).map(({ init }) => init.redirect), Array(4).fill("manual"));
  for (const { init } of requests) {
    const names = Object.keys(init.headers).map((name) => name.toLowerCase());
    assert.deepEqual(names, ["accept"]);
  }
  assert.ok(messages.some((message) => message.includes("Resumo: 5 PASS, 0 FAIL")));
  assert.ok(messages.some((message) => message.includes("não compara versões")));
});

test("diferencia timeout de resposta HTTP inesperada", async () => {
  const messages = [];
  let requestIndex = 0;
  const result = await runProductionSmoke({
    environment: validEnvironment(),
    write: (message) => messages.push(message),
    fetchImplementation: async () => {
      requestIndex += 1;
      if (requestIndex === 1) throw new DOMException("timeout", "TimeoutError");
      if (requestIndex === 2) return new Response(null, { status: 503 });
      if (requestIndex === 3) return Response.json({ status: "ok", service: "servico-incorreto" });
      if (requestIndex === 4) return new Response(null, { status: 401 });
      return new Response(null, { status: 403 });
    },
  });

  assert.equal(result.failed, 3);
  assert.equal(result.exitCode, 1);
  assert.ok(messages.some((message) => message.includes("[timeout]")));
  assert.ok(messages.some((message) => message.includes("HTTP 503; esperado 200")));
  assert.ok(messages.some((message) => message.includes("JSON inesperado")));
});
