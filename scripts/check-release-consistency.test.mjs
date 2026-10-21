import assert from "node:assert/strict";
import test from "node:test";

import {
  RESULTS,
  classifyChangedFiles,
  classifyRootPackageJson,
  concludeService,
  parseRemoteMain,
  readReleaseConfiguration,
  requestJson,
  runReleaseConsistency,
  selectRenderLiveDeploy,
  selectVercelProductionDeployment,
} from "./check-release-consistency.mjs";

const MAIN_SHA = "a".repeat(40);
const VERCEL_SHA = "b".repeat(40);
const RENDER_SHA = "c".repeat(40);

function fullEnvironment(overrides = {}) {
  return {
    VERCEL_TOKEN: "vercel-secret-for-tests",
    VERCEL_PROJECT_ID: "prj_test",
    VERCEL_TEAM_ID: "team_test",
    VERCEL_PRODUCTION_DOMAIN: "example.vercel.app",
    RENDER_API_KEY: "render-secret-for-tests",
    RENDER_SERVICE_ID: "srv-test",
    OS_SYSTEM_RELEASE_CHECK_TIMEOUT_MS: "1000",
    ...overrides,
  };
}

function vercelPayload(overrides = {}) {
  return {
    id: "dpl_test",
    projectId: "prj_test",
    target: "production",
    readyState: "READY",
    meta: { githubCommitSha: VERCEL_SHA },
    ...overrides,
  };
}

function renderPayload(overrides = {}) {
  return [{
    deploy: {
      id: "dep-test",
      status: "live",
      commit: { id: RENDER_SHA },
      ...overrides,
    },
    cursor: "cursor",
  }];
}

test("valida a configuração sem ler arquivos .env", () => {
  assert.deepEqual(readReleaseConfiguration(fullEnvironment()), {
    timeoutMs: 1000,
    vercel: {
      token: "vercel-secret-for-tests",
      projectId: "prj_test",
      teamId: "team_test",
      productionDomain: "example.vercel.app",
    },
    render: {
      apiKey: "render-secret-for-tests",
      serviceId: "srv-test",
    },
  });

  assert.throws(
    () => readReleaseConfiguration(fullEnvironment({
      VERCEL_PRODUCTION_DOMAIN: "https://example.vercel.app/path",
    })),
    /hostname válido/,
  );
});

test("interpreta somente um deployment Vercel READY de production e do projeto esperado", () => {
  assert.deepEqual(selectVercelProductionDeployment(vercelPayload(), "prj_test"), {
    verified: true,
    id: "dpl_test",
    sha: VERCEL_SHA,
    state: "READY",
  });

  assert.equal(
    selectVercelProductionDeployment(
      vercelPayload({ target: "preview" }),
      "prj_test",
    ).verified,
    false,
  );
  assert.equal(
    selectVercelProductionDeployment(vercelPayload(), "prj_other").verified,
    false,
  );
  assert.equal(
    selectVercelProductionDeployment(
      vercelPayload({ meta: { githubCommitSha: "abc123" } }),
      "prj_test",
    ).verified,
    false,
  );
});

test("identifica exatamente um deployment live do Render", () => {
  assert.deepEqual(selectRenderLiveDeploy(renderPayload()), {
    verified: true,
    id: "dep-test",
    sha: RENDER_SHA,
    state: "live",
  });

  assert.equal(selectRenderLiveDeploy([]).verified, false);
  assert.match(selectRenderLiveDeploy([]).reason, /nenhum/);
  assert.match(
    selectRenderLiveDeploy([...renderPayload(), ...renderPayload({ id: "dep-two" })]).reason,
    /mais de um/,
  );
  assert.equal(selectRenderLiveDeploy({ deploy: {} }).verified, false);
});

test("aceita apenas uma referência remota main com SHA completo", () => {
  assert.equal(parseRemoteMain(`${MAIN_SHA}\trefs/heads/main\n`), MAIN_SHA);
  assert.equal(parseRemoteMain("abc123\trefs/heads/main\n"), null);
  assert.equal(
    parseRemoteMain(`${MAIN_SHA}\trefs/heads/main\n${VERCEL_SHA}\trefs/heads/main\n`),
    null,
  );
});

test("classifica frontend, backend, compartilhado, testes e alterações operacionais", () => {
  const rootPackage = classifyRootPackageJson(
    JSON.stringify({ scripts: { build: "turbo build" }, packageManager: "pnpm@1" }),
    JSON.stringify({
      scripts: { build: "turbo build", "release:check": "node scripts/check.mjs" },
      packageManager: "pnpm@1",
    }),
  );
  assert.deepEqual(rootPackage.categories, ["operational"]);

  const entries = classifyChangedFiles([
    "apps/frontend/src/App.tsx",
    "apps/backend/src/server.ts",
    "packages/contracts/index.ts",
    "docs/DEPLOYMENT.md",
    "scripts/check-release-consistency.mjs",
    "apps/backend/tests/auth.test.ts",
    "apps/frontend/README.md",
    ".env.example",
    "package.json",
    "arquivo-desconhecido.cfg",
  ], rootPackage);
  const byFile = Object.fromEntries(entries.map((entry) => [entry.file, entry.categories]));

  assert.deepEqual(byFile["apps/frontend/src/App.tsx"], ["frontend"]);
  assert.deepEqual(byFile["apps/backend/src/server.ts"], ["backend"]);
  assert.deepEqual(byFile["packages/contracts/index.ts"], ["shared"]);
  assert.deepEqual(byFile["docs/DEPLOYMENT.md"], ["operational"]);
  assert.deepEqual(byFile["scripts/check-release-consistency.mjs"], ["operational"]);
  assert.deepEqual(byFile["apps/backend/tests/auth.test.ts"], ["operational"]);
  assert.deepEqual(byFile["apps/frontend/README.md"], ["operational"]);
  assert.deepEqual(byFile[".env.example"], ["operational"]);
  assert.deepEqual(byFile["package.json"], ["operational"]);
  assert.deepEqual(byFile["arquivo-desconhecido.cfg"], ["ambiguous"]);
});

test("não trata um script operacional no package.json como mudança de runtime", () => {
  const operational = classifyRootPackageJson(
    JSON.stringify({ scripts: { build: "turbo build" } }),
    JSON.stringify({ scripts: { build: "turbo build", "smoke:production": "node smoke.mjs" } }),
  );
  assert.deepEqual(operational.categories, ["operational"]);

  const runtime = classifyRootPackageJson(
    JSON.stringify({ scripts: { build: "turbo build" }, devDependencies: { turbo: "1" } }),
    JSON.stringify({ scripts: { build: "turbo build" }, devDependencies: { turbo: "2" } }),
  );
  assert.deepEqual(runtime.categories, ["shared"]);
});

test("compara SHAs e distingue drift por serviço, ausência de drift e ambiguidade", () => {
  assert.equal(concludeService("vercel", MAIN_SHA, MAIN_SHA, []).status, RESULTS.UP_TO_DATE);

  const changes = classifyChangedFiles([
    "apps/frontend/src/App.tsx",
    "apps/backend/src/server.ts",
    "docs/DEPLOYMENT.md",
  ]);
  assert.equal(
    concludeService("vercel", VERCEL_SHA, MAIN_SHA, changes).status,
    RESULTS.RUNTIME_DRIFT,
  );
  assert.equal(
    concludeService("render", RENDER_SHA, MAIN_SHA, changes).status,
    RESULTS.RUNTIME_DRIFT,
  );
  assert.equal(
    concludeService(
      "render",
      RENDER_SHA,
      MAIN_SHA,
      classifyChangedFiles(["docs/DEPLOYMENT.md"]),
    ).status,
    RESULTS.NO_RUNTIME_DRIFT,
  );
  assert.equal(
    concludeService(
      "vercel",
      VERCEL_SHA,
      MAIN_SHA,
      classifyChangedFiles(["configuracao-incerta.cfg"]),
    ).status,
    RESULTS.UNKNOWN,
  );
});

test("sanitiza falhas de autenticação, timeout e respostas inválidas sem vazar segredos", async () => {
  const secret = "segredo-que-nao-pode-aparecer";
  const authenticationError = await requestJson({
    provider: "Vercel",
    url: new URL("https://api.vercel.com/v13/deployments/example.vercel.app"),
    token: secret,
    timeoutMs: 1000,
    fetchImplementation: async () => new Response(`token=${secret}`, { status: 401 }),
  }).then(() => null, (error) => error);
  assert.match(authenticationError.message, /HTTP 401/);
  assert.doesNotMatch(authenticationError.message, new RegExp(secret));

  const timeoutError = await requestJson({
    provider: "Render",
    url: new URL("https://api.render.com/v1/services/srv/deploys"),
    token: secret,
    timeoutMs: 1,
    fetchImplementation: async () => {
      throw new DOMException(secret, "TimeoutError");
    },
  }).then(() => null, (error) => error);
  assert.match(timeoutError.message, /tempo limite/);
  assert.doesNotMatch(timeoutError.message, new RegExp(secret));

  await assert.rejects(
    requestJson({
      provider: "Render",
      url: new URL("https://api.render.com/v1/services/srv/deploys"),
      token: secret,
      timeoutMs: 1000,
      fetchImplementation: async () => new Response("não-json", { status: 200 }),
    }),
    /JSON válido/,
  );
});

test("executa o relatório completo com mocks e preserva método GET e credenciais fora da saída", async () => {
  const messages = [];
  const requests = [];
  const packageBefore = JSON.stringify({ scripts: { build: "turbo build" } });
  const packageAfter = JSON.stringify({
    scripts: { build: "turbo build", "release:check": "node scripts/check.mjs" },
  });

  const gitImplementation = async (args) => {
    if (args[0] === "ls-remote") {
      return { exitCode: 0, stdout: `${MAIN_SHA}\trefs/heads/main\n`, stderr: "" };
    }
    if (args[0] === "cat-file" || args[0] === "merge-base") {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "diff") {
      const deployedSha = args.at(-1).split("..")[0];
      return {
        exitCode: 0,
        stdout: deployedSha === VERCEL_SHA
          ? "docs/DEPLOYMENT.md\npackage.json\n"
          : "apps/backend/src/server.ts\n",
        stderr: "",
      };
    }
    if (args[0] === "show") {
      return {
        exitCode: 0,
        stdout: args[1].startsWith(`${MAIN_SHA}:`) ? packageAfter : packageBefore,
        stderr: "",
      };
    }
    throw new Error(`git inesperado: ${args.join(" ")}`);
  };

  const result = await runReleaseConsistency({
    environment: fullEnvironment(),
    write: (message) => messages.push(message),
    gitImplementation,
    fetchImplementation: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).startsWith("https://api.vercel.com/")) {
        return Response.json(vercelPayload());
      }
      return Response.json(renderPayload());
    },
  });

  assert.equal(result.github.sha, MAIN_SHA);
  assert.equal(result.vercel.status, RESULTS.NO_RUNTIME_DRIFT);
  assert.equal(result.render.status, RESULTS.RUNTIME_DRIFT);
  assert.equal(result.exitCode, 1);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ init }) => init.method === "GET"));
  assert.ok(requests.every(({ init }) => Object.keys(init.headers).sort().join() === "accept,authorization"));
  const output = messages.join("\n");
  assert.doesNotMatch(output, /vercel-secret-for-tests|render-secret-for-tests/);
  assert.match(output, /NO_RUNTIME_DRIFT/);
  assert.match(output, /RUNTIME_DRIFT/);
});

test("retorna código 2 com fontes essenciais ausentes e ainda consulta origin/main", async () => {
  const messages = [];
  let gitCalls = 0;
  const result = await runReleaseConsistency({
    environment: {},
    write: (message) => messages.push(message),
    gitImplementation: async () => {
      gitCalls += 1;
      return { exitCode: 0, stdout: `${MAIN_SHA}\trefs/heads/main\n`, stderr: "" };
    },
    fetchImplementation: async () => {
      throw new Error("não deveria consultar APIs sem credenciais");
    },
  });

  assert.equal(gitCalls, 1);
  assert.equal(result.exitCode, 2);
  assert.equal(result.vercel.status, RESULTS.UNKNOWN);
  assert.equal(result.render.status, RESULTS.UNKNOWN);
  assert.ok(messages.some((message) => message.includes("VERCEL_TOKEN")));
  assert.ok(messages.some((message) => message.includes("RENDER_API_KEY")));
});

test("continua consultando os provedores quando origin/main não pode ser verificado", async () => {
  let providerCalls = 0;
  const result = await runReleaseConsistency({
    environment: fullEnvironment(),
    write: () => {},
    gitImplementation: async () => ({ exitCode: 2, stdout: "", stderr: "falha local" }),
    fetchImplementation: async (url) => {
      providerCalls += 1;
      return String(url).startsWith("https://api.vercel.com/")
        ? Response.json(vercelPayload())
        : Response.json(renderPayload());
    },
  });

  assert.equal(providerCalls, 2);
  assert.equal(result.exitCode, 2);
  assert.equal(result.vercel.deployment.sha, VERCEL_SHA);
  assert.equal(result.render.deployment.sha, RENDER_SHA);
  assert.equal(result.vercel.status, RESULTS.UNKNOWN);
  assert.equal(result.render.status, RESULTS.UNKNOWN);
});
