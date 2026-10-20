import { expect, test, type Page } from "@playwright/test";
import {
  createE2ECustomerAccount,
  createE2EServiceOrder,
  createE2EUser,
  resetE2EDatabase,
} from "../support/database.js";

test.use({ trace: "off", screenshot: "off" });
test.beforeEach(async () => { await resetE2EDatabase(); });
test.afterEach(async () => { await resetE2EDatabase(); });

function monitor(page: Page, expectedStatuses = [401]) {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const expected = message.text().includes("Failed to load resource") &&
      expectedStatuses.some(status => message.text().includes(String(status)));
    if (!expected) failures.push(message.text());
  });
  return failures;
}

async function login(page: Page, user: { email: string; password: string }, customer = false) {
  await page.goto(customer ? "/customer/login" : "/login");
  await page.getByLabel("E-mail *").fill(user.email);
  await page.getByLabel("Senha *").fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(customer ? /\/customer\/area$/ : /\/$/);
}

test("confirmação mantém foco, tabela rola internamente e textos auxiliares têm contraste", async ({ page }) => {
  const failures = monitor(page);
  const admin = await createE2EUser("ADMIN", "visual");
  const technician = await createE2EUser("TECHNICIAN", "visual");
  const customer = await createE2ECustomerAccount("visual");
  await createE2EServiceOrder({ customerId: customer.customer.id, createdById: admin.id, runId: "visual" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, admin);
  const navigation = page.getByRole("link", { name: "Painel", exact: true });
  await navigation.focus();
  await expect(navigation).toBeFocused();
  expect(await navigation.evaluate(e => getComputedStyle(e).outlineColor)).toBe("rgb(255, 255, 255)");
  const ratios = await page.evaluate(() => {
    const tokens = getComputedStyle(document.documentElement);
    const luminance = (hex: string) => hex.trim().replace("#", "").match(/\w\w/g)!
      .map(pair => parseInt(pair, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const text = luminance(tokens.getPropertyValue("--text-tertiary"));
    return ["--surface-raised", "--surface-canvas"].map(name => {
      const background = luminance(tokens.getPropertyValue(name));
      return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
    });
  });
  ratios.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(4.5));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/service-orders");
  const table = page.getByRole("region", { name: "Ordens de serviço", exact: true });
  await expect(table.getByRole("row")).toHaveCount(2);
  expect(await table.locator("tbody td").first().evaluate(e => e.getBoundingClientRect().width)).toBeGreaterThanOrEqual(220);
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => table.evaluate(e => e.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  let deletions = 0;
  page.on("request", request => { if (request.method() === "DELETE") deletions++; });
  await page.goto("/users");
  const trigger = page.getByRole("row").filter({ hasText: technician.email }).getByRole("button", { name: "Excluir", exact: true });
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: "Excluir usuário" });
  const confirm = dialog.getByRole("button", { name: "Excluir", exact: true });
  const cancel = dialog.getByRole("button", { name: "Cancelar" });
  await expect(confirm).toBeFocused();
  await expect(dialog).toHaveAttribute("aria-describedby", "confirm-dialog-description");
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(deletions).toBe(0);
  expect(failures).toEqual([]);
});

test("portal acomoda título longo e restauração da sessão nos breakpoints", async ({ page }) => {
  const failures = monitor(page);
  const admin = await createE2EUser("ADMIN", "wrapping");
  const customer = await createE2ECustomerAccount("wrapping");
  const title = "FalhaDeConexao".repeat(9);
  const order = await createE2EServiceOrder({ customerId: customer.customer.id, createdById: admin.id, runId: "wrapping", title });
  await login(page, customer, true);
  for (const width of [390, 761, 840, 841, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/customer/service-orders/${order.id}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const endpoint = "http://127.0.0.1:3333/auth/customer/me";
    await page.route(endpoint, async route => { await gate; await route.continue(); });
    await page.goto("/customer/area", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".session-shell")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width <= 840) await expect(page.locator(".session-sidebar")).toBeHidden();
    release();
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
    await page.unroute(endpoint);
  }
  expect(failures).toEqual([]);
});

test("tentar novamente recupera as cinco telas internas após indisponibilidade", async ({ page }) => {
  // HTTP 503 is deliberately injected here; runtime errors remain forbidden.
  const failures = monitor(page, [401, 503]);
  const admin = await createE2EUser("ADMIN", "retry");
  await login(page, admin);
  for (const pathname of ["/", "/users", "/customers", "/service-orders", "/technicians"]) {
    const pattern = "http://127.0.0.1:3333/**";
    await page.route(pattern, route => new URL(route.request().url()).pathname.startsWith("/auth")
      ? route.continue()
      : route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Indisponibilidade simulada." }) }));
    await page.goto(pathname);
    await expect(page.getByRole("alert")).toBeVisible();
    await page.unroute(pattern);
    const response = page.waitForResponse(result => new URL(result.url()).pathname !== "/auth/me" && result.ok());
    await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await response;
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (pathname === "/users") await expect(page.getByRole("row").filter({ hasText: admin.email })).toBeVisible();
    if (pathname === "/customers") await expect(page.getByRole("heading", { name: "Não há clientes cadastrados.", exact: true })).toBeVisible();
    if (pathname === "/service-orders") await expect(page.getByRole("heading", { name: "Não há ordens de serviço cadastradas.", exact: true })).toBeVisible();
    if (pathname === "/technicians") await expect(page.getByRole("heading", { name: "Nenhum técnico cadastrado.", exact: true })).toBeVisible();
  }
  expect(failures).toEqual([]);
});
