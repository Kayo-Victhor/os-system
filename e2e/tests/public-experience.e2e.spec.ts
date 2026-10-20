import { expect, test } from "../support/fixtures.js";
import { openCredentialLink } from "../support/credential-links.js";
import { createE2ECustomerAccount, createE2EServiceOrder } from "../support/database.js";

// Disposable reset credentials must never be persisted in failure artifacts.
test.use({ trace: "off", screenshot: "off" });

test("recuperação interna mantém validação, foco e acesso com a nova senha", async ({ page, admin, database }) => {
  await page.goto("/esqueci-senha");
  await page.getByLabel("E-mail *").fill(admin.email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(page.getByRole("status")).toContainText("enviaremos");
  await expect(page.getByRole("status")).toBeFocused();

  const event = await database.emailOutbox.findFirstOrThrow({
    where: { type: "INTERNAL_PASSWORD_RESET", recipient: admin.email },
    orderBy: { createdAt: "desc" }, select: { payload: true },
  });
  const payload = event.payload as { token: string };
  await openCredentialLink(page, "/resetar-senha", payload.token);
  const password = "E2e-NovaSenha-Segura-Aa1!";
  await page.getByLabel("Nova senha *", { exact: true }).fill(password);
  await page.getByLabel("Confirmar nova senha *").fill("E2e-Diferente-Aa1!");
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByRole("alert")).toHaveText("As senhas não coincidem.");
  await expect(page.getByRole("alert")).toBeFocused();
  await page.getByLabel("Confirmar nova senha *").fill(password);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByRole("status")).toContainText("Senha redefinida com sucesso");
  await expect(page.getByRole("status")).toBeFocused();
  await page.getByRole("link", { name: "Voltar para entrar" }).click();
  await page.getByLabel("E-mail *").fill(admin.email);
  await page.getByLabel("Senha *").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("portal móvel preserva navegação, foco e separação das sessões", async ({ page, admin, runId }) => {
  const customer = await createE2ECustomerAccount(runId);
  const order = await createE2EServiceOrder({ customerId: customer.customer.id, createdById: admin.id, runId });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("E-mail *").fill(admin.email);
  await page.getByLabel("Senha *").fill(admin.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/customer/login");
  await page.getByLabel("E-mail *").fill(customer.email);
  await page.getByLabel("Senha *").fill("Senha-incorreta-Aa1!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("E-mail ou senha inválidos");
  await expect(page.getByRole("alert")).toBeFocused();
  await page.getByLabel("Senha *").fill(customer.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/area$/);
  await page.reload();
  await expect(page.getByRole("link", { name: order.title })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
  await page.getByRole("link", { name: order.title }).click();
  await expect(page.getByRole("heading", { name: order.title })).toBeVisible();
  await page.getByRole("link", { name: "Voltar para minhas ordens" }).click();
  await expect(page).toHaveURL(/\/customer\/area$/);
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL(/\/customer\/login$/);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: `Olá, ${admin.name.split(" ")[0]}` })).toBeVisible();
  await page.goto("/customer/area");
  await expect(page).toHaveURL(/\/customer\/login$/);
});
