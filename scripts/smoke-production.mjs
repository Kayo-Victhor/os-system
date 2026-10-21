#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_FRONTEND_URL = "https://os-system-nine.vercel.app";
const DEFAULT_BACKEND_URL = "https://os-system-od0v.onrender.com";
const DEFAULT_TIMEOUT_MS = 30_000;

function parseBaseUrl(name, rawValue) {
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(`${name} deve ser uma URL absoluta válida`);
  }

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error(`${name} deve usar HTTPS (HTTP é aceito somente em localhost)`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} não pode conter credenciais`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} deve conter somente a origem, sem caminho, query ou fragmento`);
  }

  return url.origin;
}

function parseTimeout(rawValue) {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error("OS_SYSTEM_SMOKE_TIMEOUT_MS deve ser um inteiro positivo");
  }
  const timeoutMs = Number(rawValue);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("OS_SYSTEM_SMOKE_TIMEOUT_MS deve estar entre 1 e 120000");
  }
  return timeoutMs;
}

export function readSmokeConfiguration(environment = process.env) {
  return {
    frontendUrl: parseBaseUrl(
      "OS_SYSTEM_FRONTEND_URL",
      environment.OS_SYSTEM_FRONTEND_URL ?? DEFAULT_FRONTEND_URL,
    ),
    backendUrl: parseBaseUrl(
      "OS_SYSTEM_BACKEND_URL",
      environment.OS_SYSTEM_BACKEND_URL ?? DEFAULT_BACKEND_URL,
    ),
    timeoutMs: parseTimeout(
      environment.OS_SYSTEM_SMOKE_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
    ),
  };
}

function healthPayloadIsValid(payload) {
  return payload !== null
    && typeof payload === "object"
    && payload.status === "ok"
    && payload.service === "os-system-api";
}

function checksFor(configuration) {
  return [
    {
      name: "Frontend público",
      url: `${configuration.frontendUrl}/`,
      expectedStatus: 200,
      redirect: "follow",
      accept: "text/html,application/xhtml+xml",
    },
    {
      name: "Saúde pelo proxy da Vercel",
      url: `${configuration.frontendUrl}/api/health`,
      expectedStatus: 200,
      redirect: "manual",
      accept: "application/json",
      validateJson: healthPayloadIsValid,
      expectedJson: 'status="ok" e service="os-system-api"',
    },
    {
      name: "Saúde direta do backend",
      url: `${configuration.backendUrl}/health`,
      expectedStatus: 200,
      redirect: "manual",
      accept: "application/json",
      validateJson: healthPayloadIsValid,
      expectedJson: 'status="ok" e service="os-system-api"',
    },
    {
      name: "Autenticação normal pelo proxy",
      url: `${configuration.frontendUrl}/api/service-orders`,
      expectedStatus: 401,
      redirect: "manual",
      accept: "application/json",
    },
    {
      name: "Bloqueio de acesso direto",
      url: `${configuration.backendUrl}/service-orders`,
      expectedStatus: 403,
      redirect: "manual",
      accept: "application/json",
    },
  ];
}

async function discardBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The status is sufficient for checks that deliberately ignore the body.
  }
}

function requestFailure(error) {
  if (error && typeof error === "object") {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return { category: "timeout", detail: "tempo limite excedido" };
    }
    if (error instanceof TypeError) {
      return { category: "rede", detail: "falha de rede ou resolução de nome" };
    }
  }
  return { category: "script", detail: "falha inesperada no verificador" };
}

async function executeCheck(check, timeoutMs, fetchImplementation) {
  let response;
  try {
    response = await fetchImplementation(check.url, {
      method: "GET",
      redirect: check.redirect,
      headers: { accept: check.accept },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const failure = requestFailure(error);
    return { passed: false, ...failure };
  }

  if (response.status !== check.expectedStatus) {
    await discardBody(response);
    const redirectDetail = response.status >= 300 && response.status < 400
      ? " (redirecionamento não esperado)"
      : "";
    return {
      passed: false,
      category: "resposta",
      detail: `HTTP ${response.status}; esperado ${check.expectedStatus}${redirectDetail}`,
    };
  }

  if (check.validateJson) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      return {
        passed: false,
        category: "resposta",
        detail: "resposta não contém JSON válido",
      };
    }
    if (!check.validateJson(payload)) {
      return {
        passed: false,
        category: "resposta",
        detail: `JSON inesperado; esperado ${check.expectedJson}`,
      };
    }
  } else {
    await discardBody(response);
  }

  return {
    passed: true,
    detail: `HTTP ${response.status}${response.redirected ? " após redirecionamento" : ""}`,
  };
}

export async function runProductionSmoke(options = {}) {
  const write = options.write ?? console.log;
  const fetchImplementation = options.fetchImplementation ?? fetch;

  let configuration;
  try {
    configuration = readSmokeConfiguration(options.environment ?? process.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "configuração inválida";
    write(`FAIL Configuração — ${message}`);
    return { total: 0, passed: 0, failed: 1, exitCode: 2 };
  }

  write("OS-SYSTEM — verificação pública de pós-deploy");
  write(`Timeout por requisição: ${configuration.timeoutMs} ms`);

  let passed = 0;
  let failed = 0;
  for (const check of checksFor(configuration)) {
    const result = await executeCheck(check, configuration.timeoutMs, fetchImplementation);
    if (result.passed) {
      passed += 1;
      write(`PASS ${check.name} — ${result.detail}`);
    } else {
      failed += 1;
      write(`FAIL ${check.name} [${result.category}] — ${result.detail}`);
    }
  }

  write(`Resumo: ${passed} PASS, ${failed} FAIL, ${passed + failed} verificações`);
  write(
    "Observação: este script não compara versões. Confirme os SHAs publicados "
      + "nos painéis da Vercel e do Render.",
  );

  return {
    total: passed + failed,
    passed,
    failed,
    exitCode: failed === 0 ? 0 : 1,
  };
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const result = await runProductionSmoke();
  process.exitCode = result.exitCode;
}
