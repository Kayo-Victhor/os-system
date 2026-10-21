#!/usr/bin/env node

import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_VERCEL_DOMAIN = "os-system-nine.vercel.app";
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;

const RESULTS = Object.freeze({
  UP_TO_DATE: "UP_TO_DATE",
  NO_RUNTIME_DRIFT: "NO_RUNTIME_DRIFT",
  RUNTIME_DRIFT: "RUNTIME_DRIFT",
  UNKNOWN: "UNKNOWN",
});

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseTimeout(rawValue) {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error("OS_SYSTEM_RELEASE_CHECK_TIMEOUT_MS deve ser um inteiro positivo");
  }
  const timeoutMs = Number(rawValue);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("OS_SYSTEM_RELEASE_CHECK_TIMEOUT_MS deve estar entre 1 e 120000");
  }
  return timeoutMs;
}

function parseHostname(rawValue) {
  const value = rawValue.trim().toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error("VERCEL_PRODUCTION_DOMAIN deve ser um hostname válido, sem protocolo ou caminho");
  }
  return value;
}

export function readReleaseConfiguration(environment = process.env) {
  const timeoutMs = parseTimeout(
    environment.OS_SYSTEM_RELEASE_CHECK_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
  );

  return {
    timeoutMs,
    vercel: {
      token: environment.VERCEL_TOKEN,
      projectId: environment.VERCEL_PROJECT_ID,
      teamId: environment.VERCEL_TEAM_ID,
      productionDomain: parseHostname(
        environment.VERCEL_PRODUCTION_DOMAIN ?? DEFAULT_VERCEL_DOMAIN,
      ),
    },
    render: {
      apiKey: environment.RENDER_API_KEY,
      serviceId: environment.RENDER_SERVICE_ID,
    },
  };
}

function missingVariables(configuration) {
  const missing = [];
  if (!hasValue(configuration.vercel.token)) missing.push("VERCEL_TOKEN");
  if (!hasValue(configuration.vercel.projectId)) missing.push("VERCEL_PROJECT_ID");
  if (!hasValue(configuration.render.apiKey)) missing.push("RENDER_API_KEY");
  if (!hasValue(configuration.render.serviceId)) missing.push("RENDER_SERVICE_ID");
  return missing;
}

function safeErrorMessage(provider, status) {
  if (status === 401 || status === 403) {
    return `${provider}: credencial ausente, inválida ou sem permissão (HTTP ${status})`;
  }
  return `${provider}: resposta HTTP ${status} inesperada`;
}

export async function requestJson({
  provider,
  url,
  token,
  timeoutMs,
  fetchImplementation = fetch,
}) {
  let response;
  try {
    response = await fetchImplementation(url, {
      method: "GET",
      redirect: "error",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error && typeof error === "object"
      && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`${provider}: tempo limite excedido`);
    }
    throw new Error(`${provider}: falha de rede durante a consulta`);
  }

  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // O corpo não é necessário e pode conter detalhes que não devem ir ao relatório.
    }
    throw new Error(safeErrorMessage(provider, response.status));
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${provider}: resposta não contém JSON válido`);
  }
}

function normalizeSha(value) {
  return typeof value === "string" && FULL_SHA_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

export function selectVercelProductionDeployment(payload, expectedProjectId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { verified: false, reason: "resposta de deployment inválida" };
  }

  const projectId = payload.projectId ?? payload.project?.id;
  if (!hasValue(projectId) || projectId !== expectedProjectId) {
    return { verified: false, reason: "deployment não pôde ser associado ao projeto esperado" };
  }

  const state = payload.readyState ?? payload.state;
  if (payload.target !== "production" || state !== "READY") {
    return {
      verified: false,
      reason: "o domínio de produção não aponta para um deployment READY de production",
      state: hasValue(state) ? state : "desconhecido",
    };
  }

  const sha = normalizeSha(payload.meta?.githubCommitSha ?? payload.gitSource?.sha);
  if (!sha) {
    return {
      verified: false,
      reason: "deployment de produção sem SHA Git completo e verificável",
      state,
    };
  }

  return {
    verified: true,
    id: hasValue(payload.id) ? payload.id : "não informado",
    sha,
    state,
  };
}

export function selectRenderLiveDeploy(payload) {
  if (!Array.isArray(payload)) {
    return { verified: false, reason: "resposta de deploys inválida" };
  }

  const liveDeploys = payload
    .map((entry) => entry?.deploy ?? entry)
    .filter((deploy) => deploy && typeof deploy === "object" && deploy.status === "live");

  if (liveDeploys.length !== 1) {
    return {
      verified: false,
      reason: liveDeploys.length === 0
        ? "nenhum deployment live foi identificado"
        : "mais de um deployment live tornou a origem ambígua",
    };
  }

  const deploy = liveDeploys[0];
  const sha = normalizeSha(deploy.commit?.id);
  if (!sha) {
    return {
      verified: false,
      reason: "deployment live sem SHA Git completo e verificável",
      state: "live",
    };
  }

  return {
    verified: true,
    id: hasValue(deploy.id) ? deploy.id : "não informado",
    sha,
    state: "live",
  };
}

async function queryVercel(configuration, fetchImplementation) {
  const missing = [];
  if (!hasValue(configuration.token)) missing.push("VERCEL_TOKEN");
  if (!hasValue(configuration.projectId)) missing.push("VERCEL_PROJECT_ID");
  if (missing.length > 0) {
    return { verified: false, reason: `variáveis ausentes: ${missing.join(", ")}` };
  }

  const url = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(configuration.productionDomain)}`,
  );
  url.searchParams.set("withGitRepoInfo", "true");
  if (hasValue(configuration.teamId)) url.searchParams.set("teamId", configuration.teamId);

  try {
    const payload = await requestJson({
      provider: "Vercel",
      url,
      token: configuration.token,
      timeoutMs: configuration.timeoutMs,
      fetchImplementation,
    });
    return selectVercelProductionDeployment(payload, configuration.projectId);
  } catch (error) {
    return {
      verified: false,
      reason: error instanceof Error ? error.message : "Vercel: falha inesperada",
    };
  }
}

async function queryRender(configuration, fetchImplementation) {
  const missing = [];
  if (!hasValue(configuration.apiKey)) missing.push("RENDER_API_KEY");
  if (!hasValue(configuration.serviceId)) missing.push("RENDER_SERVICE_ID");
  if (missing.length > 0) {
    return { verified: false, reason: `variáveis ausentes: ${missing.join(", ")}` };
  }

  const url = new URL(
    `https://api.render.com/v1/services/${encodeURIComponent(configuration.serviceId)}/deploys`,
  );
  url.searchParams.set("status", "live");
  url.searchParams.set("limit", "20");

  try {
    const payload = await requestJson({
      provider: "Render",
      url,
      token: configuration.apiKey,
      timeoutMs: configuration.timeoutMs,
      fetchImplementation,
    });
    return selectRenderLiveDeploy(payload);
  } catch (error) {
    return {
      verified: false,
      reason: error instanceof Error ? error.message : "Render: falha inesperada",
    };
  }
}

function defaultGitImplementation(args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: options.cwd ?? process.cwd(),
        encoding: "utf8",
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout = "", stderr = "") => {
        if (!error) {
          resolve({ exitCode: 0, stdout, stderr });
          return;
        }
        resolve({
          exitCode: Number.isInteger(error.code) ? error.code : 2,
          stdout,
          stderr,
          timedOut: Boolean(error.killed),
        });
      },
    );
  });
}

export function parseRemoteMain(output) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) return null;
  const [sha, reference, ...extra] = lines[0].split(/\s+/);
  if (extra.length > 0 || reference !== "refs/heads/main") return null;
  return normalizeSha(sha);
}

async function queryGitHubMain(gitImplementation, timeoutMs) {
  const result = await gitImplementation(
    ["ls-remote", "--refs", "origin", "refs/heads/main"],
    { timeoutMs },
  );
  if (result.exitCode !== 0) {
    return {
      verified: false,
      reason: result.timedOut
        ? "GitHub: tempo limite excedido ao consultar origin/main"
        : "GitHub: não foi possível consultar origin/main",
    };
  }
  const sha = parseRemoteMain(result.stdout);
  return sha
    ? { verified: true, sha, state: "main" }
    : { verified: false, reason: "GitHub: origin/main não retornou um SHA completo inequívoco" };
}

function isTestOrGeneratedPath(file) {
  return /(^|\/)(tests?|__tests__|coverage|test-results|playwright-report)(\/|$)/.test(file)
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
    || /(^|\/)(?:vitest|playwright|eslint)\.config\.[cm]?[jt]s$/.test(file);
}

function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

export function classifyRootPackageJson(beforeText, afterText) {
  let before;
  let after;
  try {
    before = JSON.parse(beforeText);
    after = JSON.parse(afterText);
  } catch {
    return { categories: ["ambiguous"], details: ["package.json não pôde ser analisado"] };
  }

  const runtimeFields = new Set([
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "peerDependenciesMeta",
    "engines",
    "packageManager",
    "pnpm",
    "overrides",
    "resolutions",
    "type",
    "exports",
    "imports",
    "workspaces",
  ]);
  const metadataFields = new Set(["name", "version", "private", "description", "license"]);
  const operationalScript = /^(?:test(?::|$)|lint(?::|$)|format(?::|$)|smoke(?::|$)|release(?::|$)|docs(?::|$)|e2e(?::|$))/;
  const runtimeScript = /^(?:build(?::|$)|start(?::|$)|preinstall$|install$|postinstall$|prepare$)/;
  const categories = new Set();
  const details = [];

  for (const field of changedKeys(before, after)) {
    if (field === "scripts") {
      for (const scriptName of changedKeys(before.scripts, after.scripts)) {
        if (runtimeScript.test(scriptName)) categories.add("shared");
        else if (operationalScript.test(scriptName) || scriptName === "dev") categories.add("operational");
        else categories.add("ambiguous");
        details.push(`package.json#scripts.${scriptName}`);
      }
    } else if (runtimeFields.has(field)) {
      categories.add("shared");
      details.push(`package.json#${field}`);
    } else if (metadataFields.has(field)) {
      categories.add("operational");
      details.push(`package.json#${field}`);
    } else {
      categories.add("ambiguous");
      details.push(`package.json#${field}`);
    }
  }

  return { categories: [...categories], details };
}

export function classifyChangedFiles(files, packageJsonClassification = null) {
  const entries = [];
  for (const file of files) {
    const categories = new Set();
    const details = [];

    if (file === "package.json") {
      for (const category of packageJsonClassification?.categories ?? ["ambiguous"]) {
        categories.add(category);
      }
      details.push(...(packageJsonClassification?.details ?? ["package.json"]));
    } else if (isTestOrGeneratedPath(file)
      || file.startsWith("docs/")
      || file.startsWith(".github/")
      || file === "README.md"
      || file.endsWith(".md")
      || /^\.env(?:\.[^/]+)?\.example$/.test(file)
      || [".gitignore", ".hintrc"].includes(file)) {
      categories.add("operational");
    } else if (file.startsWith("apps/frontend/")) {
      categories.add("frontend");
    } else if (file.startsWith("apps/backend/")) {
      categories.add("backend");
    } else if (file.startsWith("packages/")
      || ["pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json", "render.yaml", "vercel.json", ".npmrc", ".node-version", ".nvmrc"].includes(file)
      || /^Dockerfile(?:\.|$)/.test(file)
      || /^tsconfig(?:\.|$)/.test(file)) {
      categories.add("shared");
    } else if (file.startsWith("scripts/")) {
      if (/^scripts\/(?:dev-check|e2e-[^/]+|smoke-[^/]+|check-release-consistency)(?:\.|$)/.test(file)) {
        categories.add("operational");
      } else {
        categories.add("ambiguous");
      }
    } else {
      categories.add("ambiguous");
    }

    entries.push({ file, categories: [...categories], details });
  }
  return entries;
}

async function localCommitExists(sha, gitImplementation, timeoutMs) {
  const result = await gitImplementation(["cat-file", "-e", `${sha}^{commit}`], { timeoutMs });
  return result.exitCode === 0;
}

async function loadRootPackageClassification(deployedSha, mainSha, gitImplementation, timeoutMs) {
  const [before, after] = await Promise.all([
    gitImplementation(["show", `${deployedSha}:package.json`], { timeoutMs }),
    gitImplementation(["show", `${mainSha}:package.json`], { timeoutMs }),
  ]);
  if (before.exitCode !== 0 || after.exitCode !== 0) return null;
  return classifyRootPackageJson(before.stdout, after.stdout);
}

export function concludeService(service, deployedSha, mainSha, classifiedChanges) {
  if (deployedSha === mainSha) {
    return { status: RESULTS.UP_TO_DATE, relevant: [], ambiguous: [] };
  }

  const relevantCategories = service === "vercel"
    ? new Set(["frontend", "shared"])
    : new Set(["backend", "shared"]);
  const relevant = classifiedChanges.filter((entry) => (
    entry.categories.some((category) => relevantCategories.has(category))
  ));
  const ambiguous = classifiedChanges.filter((entry) => entry.categories.includes("ambiguous"));

  if (relevant.length > 0) {
    return { status: RESULTS.RUNTIME_DRIFT, relevant, ambiguous };
  }
  if (ambiguous.length > 0) {
    return { status: RESULTS.UNKNOWN, relevant, ambiguous };
  }
  return { status: RESULTS.NO_RUNTIME_DRIFT, relevant, ambiguous };
}

async function analyzeDeployment(service, deployment, mainSha, gitImplementation, timeoutMs) {
  if (!deployment.verified) {
    return { status: RESULTS.UNKNOWN, reason: deployment.reason, deployment };
  }
  if (deployment.sha === mainSha) {
    return {
      status: RESULTS.UP_TO_DATE,
      deployment,
      changes: [],
      relevant: [],
      ambiguous: [],
    };
  }

  const [deployedExists, mainExists] = await Promise.all([
    localCommitExists(deployment.sha, gitImplementation, timeoutMs),
    localCommitExists(mainSha, gitImplementation, timeoutMs),
  ]);
  if (!deployedExists || !mainExists) {
    return {
      status: RESULTS.UNKNOWN,
      reason: "objetos de commit necessários não estão disponíveis no repositório local",
      deployment,
    };
  }

  const ancestry = await gitImplementation(
    ["merge-base", "--is-ancestor", deployment.sha, mainSha],
    { timeoutMs },
  );
  if (ancestry.exitCode !== 0) {
    return {
      status: RESULTS.UNKNOWN,
      reason: "o deployment não é ancestral de origin/main; rollback ou histórico divergente exige revisão manual",
      deployment,
    };
  }

  const diff = await gitImplementation(
    ["diff", "--name-only", "--no-renames", `${deployment.sha}..${mainSha}`],
    { timeoutMs },
  );
  if (diff.exitCode !== 0) {
    return {
      status: RESULTS.UNKNOWN,
      reason: "não foi possível calcular os arquivos alterados entre as revisões",
      deployment,
    };
  }

  const files = diff.stdout.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
  const packageJsonClassification = files.includes("package.json")
    ? await loadRootPackageClassification(
      deployment.sha,
      mainSha,
      gitImplementation,
      timeoutMs,
    )
    : null;
  const changes = classifyChangedFiles(files, packageJsonClassification);
  const conclusion = concludeService(service, deployment.sha, mainSha, changes);
  return { ...conclusion, deployment, changes };
}

function formatSha(sha) {
  return sha ?? "não verificável";
}

function actionFor(service, result) {
  if (result.status === RESULTS.UP_TO_DATE) return "Nenhuma ação de release necessária.";
  if (result.status === RESULTS.NO_RUNTIME_DRIFT) {
    return "Revisar o diff; não publicar somente para igualar o SHA se as mudanças continuarem operacionais.";
  }
  if (result.status === RESULTS.RUNTIME_DRIFT) {
    return service === "Vercel"
      ? "Revisar as mudanças de runtime e decidir por uma publicação de produção na Vercel."
      : "Revisar migrations/compatibilidade e decidir por um deploy manual do commit exato no Render.";
  }
  return "Completar credenciais/metadados ou disponibilizar o histórico local e repetir a verificação.";
}

function writeServiceReport(write, label, service, result) {
  const deployment = result.deployment ?? {};
  write(`\n${label}`);
  write(`  Estado do provedor: ${deployment.state ?? "não verificável"}`);
  write(`  SHA publicado: ${formatSha(deployment.sha)}`);
  write(`  Conclusão: ${result.status}`);
  if (result.reason) write(`  Motivo: ${result.reason}`);

  if (result.changes?.length > 0) {
    write("  Alterações desde o deployment:");
    for (const entry of result.changes) {
      write(`    - [${entry.categories.join(", ")}] ${entry.file}`);
      for (const detail of entry.details) write(`      · ${detail}`);
    }
  } else if (result.status === RESULTS.NO_RUNTIME_DRIFT) {
    write("  Alterações desde o deployment: somente documentação/ferramentas operacionais conhecidas.");
  }
  write(`  Próxima ação: ${actionFor(service, result)}`);
}

export async function runReleaseConsistency(options = {}) {
  const write = options.write ?? console.log;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const gitImplementation = options.gitImplementation ?? defaultGitImplementation;

  let configuration;
  try {
    configuration = readReleaseConfiguration(options.environment ?? process.env);
  } catch (error) {
    write(`UNKNOWN Configuração — ${error instanceof Error ? error.message : "configuração inválida"}`);
    return { exitCode: 2, github: null, vercel: null, render: null };
  }

  write("OS-SYSTEM — consistência entre releases");
  write("Consultas externas: somente GET; nenhum arquivo .env é carregado pelo script.");
  const missing = missingVariables(configuration);
  if (missing.length > 0) write(`Variáveis ausentes: ${missing.join(", ")}`);

  const [github, vercelDeployment, renderDeployment] = await Promise.all([
    queryGitHubMain(gitImplementation, configuration.timeoutMs),
    queryVercel(
      { ...configuration.vercel, timeoutMs: configuration.timeoutMs },
      fetchImplementation,
    ),
    queryRender(
      { ...configuration.render, timeoutMs: configuration.timeoutMs },
      fetchImplementation,
    ),
  ]);
  write(`\nGitHub main: ${github.verified ? github.sha : "UNKNOWN"}`);
  if (!github.verified) write(`Motivo: ${github.reason}`);

  const [vercel, render] = github.verified
    ? await Promise.all([
      analyzeDeployment("vercel", vercelDeployment, github.sha, gitImplementation, configuration.timeoutMs),
      analyzeDeployment("render", renderDeployment, github.sha, gitImplementation, configuration.timeoutMs),
    ])
    : [
      {
        status: RESULTS.UNKNOWN,
        reason: vercelDeployment.verified
          ? `comparação indisponível porque ${github.reason}`
          : `${vercelDeployment.reason}; comparação indisponível porque ${github.reason}`,
        deployment: vercelDeployment,
      },
      {
        status: RESULTS.UNKNOWN,
        reason: renderDeployment.verified
          ? `comparação indisponível porque ${github.reason}`
          : `${renderDeployment.reason}; comparação indisponível porque ${github.reason}`,
        deployment: renderDeployment,
      },
    ];

  writeServiceReport(write, "Vercel (produção)", "vercel", vercel);
  writeServiceReport(write, "Render (deployment live)", "render", render);
  write(
    "\nLimitação: NO_RUNTIME_DRIFT é uma classificação por caminhos e campos conhecidos, "
      + "não uma prova absoluta de compatibilidade.",
  );

  const statuses = [vercel.status, render.status];
  const exitCode = statuses.includes(RESULTS.UNKNOWN)
    ? 2
    : statuses.includes(RESULTS.RUNTIME_DRIFT)
      ? 1
      : 0;
  write(`Resultado final: código ${exitCode}`);
  return { exitCode, github, vercel, render };
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const result = await runReleaseConsistency();
  process.exitCode = result.exitCode;
}

export { RESULTS };
