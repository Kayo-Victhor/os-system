import { mkdirSync } from "node:fs";
import { test, expect } from "../support/fixtures.js";
import { createE2ECustomerAccount, createE2EServiceOrder } from "../support/database.js";
import { formatSlaDate, formatSlaMinutes, resolutionSlaEstimate, resolutionSlaPresentation,
  type ResolutionSlaData } from "../../apps/frontend/src/utils/resolution-sla.js";

test.use({ timezoneId: "America/Sao_Paulo", trace: "off", screenshot: "off" });

const due = "2026-10-21T15:00:00.000Z";
const tracked: ResolutionSlaData = { status: "OPEN", resolutionSlaMinutes: 480, resolutionDueAt: due, resolutionSlaStatus: "ON_TRACK" };

test("apresentação cobre todos os estados sem reclassificar o SLA", () => {
  for (const [state, label] of [
    ["ON_TRACK", "No prazo"], ["DUE_SOON", "Vence em breve"], ["BREACHED", "Atrasada"],
    ["MET", "Concluída no prazo"], ["CANCELLED", "Cancelada"], ["UNTRACKED", "Sem SLA registrado"],
  ] as const) {
    expect(resolutionSlaPresentation({ ...tracked, resolutionSlaStatus: state }).label).toBe(label);
  }
  expect(resolutionSlaPresentation({ ...tracked, status: "COMPLETED", resolutionSlaStatus: "BREACHED" }).label).toBe("Concluída fora do prazo");
  expect(resolutionSlaPresentation(tracked).state).toBe("ON_TRACK");
  expect(resolutionSlaPresentation({ ...tracked, resolutionSlaStatus: "MET", status: "COMPLETED" }).tone).toBe("badge-green");
});

test("dados ausentes, nulos ou inválidos permanecem neutros", () => {
  for (const data of [
    { status: "OPEN" }, { ...tracked, resolutionDueAt: null }, { ...tracked, resolutionDueAt: "inválida" },
    { ...tracked, resolutionSlaMinutes: null }, { ...tracked, resolutionSlaMinutes: 0 },
    { ...tracked, resolutionSlaStatus: null }, { ...tracked, resolutionSlaMinutes: -1 },
  ] as ResolutionSlaData[]) {
    expect(resolutionSlaPresentation(data)).toMatchObject({ state: "UNTRACKED", label: "Sem SLA registrado", dueAt: null, targetMinutes: null });
    expect(resolutionSlaEstimate(data, Date.parse(due))).toBeNull();
  }
});

test("datas respeitam o instante ISO e metas usam horas e minutos em PT-BR", () => {
  expect(formatSlaDate(due, "America/Sao_Paulo")).toBe("21/10/2026, 12:00");
  expect(formatSlaDate("2026-10-21T12:00:00-03:00", "America/Sao_Paulo")).toBe(formatSlaDate(due, "America/Sao_Paulo"));
  expect(formatSlaDate(due, "UTC")).toBe("21/10/2026, 15:00");
  for (const [minutes, label] of [[1, "1 minuto"], [59, "59 minutos"], [60, "1 hora"], [61, "1 hora e 1 minuto"], [480, "8 horas"], [1440, "24 horas"], [4320, "72 horas"]] as const) {
    expect(formatSlaMinutes(minutes)).toBe(label);
  }
});

test("estimativas têm relógio explícito, limites de minuto e não afetam estados finais", () => {
  const deadline = Date.parse(due);
  for (const [remaining, label] of [[0, "menos de 1 minuto"], [1, "menos de 1 minuto"], [59_999, "menos de 1 minuto"], [60_000, "1 minuto"], [3_600_000, "1 hora"], [3_660_000, "1 hora e 1 minuto"]] as const) {
    expect(resolutionSlaEstimate(tracked, deadline - remaining)).toBe(`Tempo restante estimado: ${label}`);
    if (remaining > 0) expect(resolutionSlaEstimate({ ...tracked, resolutionSlaStatus: "BREACHED" }, deadline + remaining)).toBe(`Atraso estimado: ${label}`);
  }
  expect(resolutionSlaEstimate(tracked, deadline + 1)).toContain("Atualize a página");
  expect(resolutionSlaPresentation(tracked).label).toBe("No prazo");
  for (const status of ["COMPLETED", "CANCELLED"] as const) expect(resolutionSlaEstimate({ ...tracked, status }, deadline)).toBeNull();
  expect(resolutionSlaEstimate(tracked, NaN)).toBeNull();
});

test("fila renderiza a criticidade do SLA antes dos itens sem prazo e terminais", async ({ page, admin, database, runId }) => {
  const customer = await createE2ECustomerAccount(runId, { name: "Cliente da fila SLA" });
  const now = Date.now();
  const cases = [
    ["Vencida baixa", "OPEN", "LOW", -240],
    ["Vencida urgente", "WAITING", "URGENT", -60],
    ["Vigente próxima", "IN_PROGRESS", "LOW", 30],
    ["Vigente distante", "OPEN", "URGENT", 120],
    ["Sem prazo", "OPEN", "URGENT", null],
    ["Concluída", "COMPLETED", "URGENT", -480],
  ] as const;

  for (const [label, status, priority, minutes] of cases) {
    const order = await createE2EServiceOrder({
      customerId: customer.customer.id,
      createdById: admin.id,
      runId,
      title: `Fila SLA ${label}`,
      status,
      priority,
    });
    if (minutes !== null) {
      await database.serviceOrder.update({
        where: { id: order.id },
        data: {
          resolutionSlaMinutes: 480,
          resolutionDueAt: new Date(now + minutes * 60_000),
        },
      });
    }
  }

  await page.goto("/login");
  await page.getByLabel("E-mail *").fill(admin.email);
  await page.getByLabel("Senha *").fill(admin.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/service-orders");

  await expect(page.locator(".order-title")).toHaveText([
    "Fila SLA Vencida urgente",
    "Fila SLA Vencida baixa",
    "Fila SLA Vigente próxima",
    "Fila SLA Vigente distante",
    "Fila SLA Sem prazo",
    "Fila SLA Concluída",
  ]);

  const captureDir = process.env.OS_SLA_CAPTURE_DIR;
  if (captureDir) {
    mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ path: `${captureDir}/fila-ordenada.png`, fullPage: false, animations: "disabled" });
  }

  await page.getByLabel("Filtrar por prioridade").selectOption("LOW");
  await expect(page.locator(".order-title")).toHaveText([
    "Fila SLA Vencida baixa",
    "Fila SLA Vigente próxima",
  ]);
});

test("lista e detalhe exibem SLA real sem consultas por linha e sem expor campos no portal", async ({ page, admin, database, runId }) => {
  const customer = await createE2ECustomerAccount(runId, { name: "Cliente de demonstração" });
  const now = Date.now();
  const cases = [
    ["No prazo", "OPEN", 4 * 60], ["Vence em breve", "WAITING", 30],
    ["Atrasada", "IN_PROGRESS", -120], ["Concluída fora do prazo", "COMPLETED", -120],
    ["Concluída no prazo", "COMPLETED", 120], ["Cancelada", "CANCELLED", 120],
    ["Sem SLA registrado", "OPEN", null],
  ] as const;
  const orders: Array<Awaited<ReturnType<typeof createE2EServiceOrder>> & { label: string }> = [];
  for (const [label, status, minutes] of cases) {
    const order = await createE2EServiceOrder({ customerId: customer.customer.id, createdById: admin.id, runId, title: `Atendimento ${label}`, status, priority: "HIGH" });
    await database.serviceOrder.update({ where: { id: order.id }, data: {
      ...(minutes === null ? {} : { resolutionSlaMinutes: 480, resolutionDueAt: new Date(now + minutes * 60_000) }),
      ...(status === "COMPLETED" ? { completedAt: new Date(now) } : {}),
    } });
    orders.push({ ...order, label });
  }
  await page.goto("/login");
  await page.getByLabel("E-mail *").fill(admin.email);
  await page.getByLabel("Senha *").fill(admin.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const detailRequests: string[] = [];
  page.on("request", request => {
    if (/\/service-orders\/[^/?]+$/.test(new URL(request.url()).pathname)) detailRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/service-orders");
  await expect(page.getByRole("columnheader", { name: "Prazo / SLA" })).toBeVisible();
  for (const order of orders) await expect(page.getByRole("row").filter({ hasText: order.title }).locator(".resolution-sla .badge")).toHaveText(order.label);
  expect(detailRequests).toEqual([]);
  const captureDir = process.env.OS_SLA_CAPTURE_DIR;
  if (captureDir) {
    mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ path: `${captureDir}/lista-desktop.png`, fullPage: false, animations: "disabled" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const table = page.getByRole("region", { name: "Ordens de serviço", exact: true });
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect(page.getByRole("columnheader", { name: "Prazo / SLA" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.evaluate(() => scrollTo(0, 0));
  if (captureDir) await page.screenshot({ path: `${captureDir}/lista-mobile.png`, fullPage: false, animations: "disabled" });
  for (const order of orders) {
    await page.goto(`/service-orders/${order.id}`);
    const sla = page.locator(".internal-order-context").locator(".ui-page-section").filter({ has: page.getByRole("heading", { name: "SLA de resolução", exact: true }) });
    await expect(sla.locator(".badge")).toHaveText(order.label);
    if (order.label === "Sem SLA registrado") {
      await expect(sla).toContainText("não possui monitoramento");
      await expect(sla.locator("time")).toHaveCount(0);
    } else {
      await expect(sla).toContainText("8 horas");
      await expect(sla.locator("time")).toHaveAttribute("datetime", /Z$/);
    }
    if (order.status === "COMPLETED" || order.status === "CANCELLED") await expect(sla.locator(".resolution-sla__estimate")).toHaveCount(0);
    for (const width of [390, 840, 900, 901, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    if (captureDir && order.label === "Atrasada") {
      await page.screenshot({ path: `${captureDir}/detalhe-desktop.png`, fullPage: false, animations: "disabled" });
      await page.setViewportSize({ width: 390, height: 844 });
      await sla.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${captureDir}/detalhe-mobile.png`, fullPage: false, animations: "disabled" });
    }
  }
  // Compatibility with an older internal response: omit fields only in this explicit mock.
  const compatibilityRoute = "http://127.0.0.1:3333/service-orders**";
  await page.route(compatibilityRoute, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path !== "/service-orders" && path !== `/service-orders/${orders[0].id}`) return route.continue();
    const response = await route.fetch();
    const json = await response.json();
    for (const item of json.items ?? [json]) {
      for (const field of ["resolutionSlaMinutes", "resolutionDueAt", "resolutionSlaStatus", "completedAt"]) delete item[field];
    }
    await route.fulfill({ response, json });
  });
  await page.goto(`/service-orders/${orders[0].id}`);
  await expect(page.locator(".resolution-sla .badge")).toHaveText("Sem SLA registrado");
  await expect(page.locator(".resolution-sla time")).toHaveCount(0);
  await page.goto("/service-orders");
  await expect(page.locator(".resolution-sla .badge")).toHaveText(orders.map(() => "Sem SLA registrado"));
  await page.unroute(compatibilityRoute);
  await page.context().clearCookies();
  await page.goto("/customer/login");
  await page.getByLabel("E-mail *").fill(customer.email);
  await page.getByLabel("Senha *").fill(customer.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/area$/);
  for (const path of ["/auth/customer/service-orders", `/auth/customer/service-orders/${orders[0].id}`]) {
    const response = await page.request.get(`http://127.0.0.1:3333${path}`);
    expect(response.ok()).toBe(true);
    const json = await response.json();
    for (const item of Array.isArray(json) ? json : [json]) {
      for (const field of ["resolutionSlaMinutes", "resolutionDueAt", "resolutionSlaStatus", "completedAt"]) expect(item).not.toHaveProperty(field);
    }
  }
  await page.goto(`/customer/service-orders/${orders[0].id}`);
  await expect(page.getByRole("heading", { name: orders[0].title, exact: true })).toBeVisible();
  await expect(page.getByText("SLA de resolução", { exact: true })).toHaveCount(0);
});
