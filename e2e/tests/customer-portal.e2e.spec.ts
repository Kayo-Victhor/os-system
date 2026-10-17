import { expect, test, type Page } from "../support/fixtures.js";
import {
  createE2ECustomerAccount,
  createE2EServiceOrder,
  readE2EOutboxToken,
} from "../support/database.js";

const API_ORIGIN = "http://127.0.0.1:3333";

// Confirmation and reset links carry one-time credentials in their query
// strings. Disable failure artifacts for this file so those values never end
// up in a Playwright trace or screenshot.
test.use({ trace: "off", screenshot: "off" });

async function loginCustomer(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/customer/login");
  await page.getByRole("textbox", { name: "E-mail *" }).fill(credentials.email);
  await page.getByRole("textbox", { name: "Senha *" }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/customer\/area$/);
}

test("cliente conclui cadastro público, confirma e restaura a sessão", async ({
  page,
  database,
  runId,
}) => {
  const email = `cadastro-${runId}@example.test`;
  const password = `E2e-${runId}-Cadastro-Aa1!`;
  const name = `Cliente Cadastro ${runId}`;

  await page.goto("/registrar");
  await page.getByRole("textbox", { name: "Nome completo *" }).fill(name);
  await page.getByRole("textbox", { name: "E-mail *" }).fill(email);
  await page.getByRole("textbox", { name: "Senha *" }).fill(password);
  await page.getByRole("button", { name: "Solicitar cadastro" }).click();

  await expect(page.getByRole("heading", { name: "Verifique seu e-mail" })).toBeVisible();
  const confirmationToken = await readE2EOutboxToken(
    "CUSTOMER_REGISTRATION_VERIFICATION",
    email,
  );

  await page.goto(`/confirmar-cadastro?token=${encodeURIComponent(confirmationToken)}`);
  await expect(page.getByRole("status")).toContainText("Cadastro confirmado com sucesso");
  await expect(database.customerAccount.findUnique({ where: { email } })).resolves.toMatchObject({
    status: "ACTIVE",
  });

  await page.getByRole("link", { name: "Ir para o login" }).click();
  await page.getByRole("textbox", { name: "E-mail *" }).fill(email);
  await page.getByRole("textbox", { name: "Senha *" }).fill(`${password}-incorreta`);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toContainText("E-mail ou senha inválidos");

  await page.getByRole("textbox", { name: "Senha *" }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/customer\/area$/);
  await expect(page.getByRole("heading", { name: new RegExp(`Olá, Cliente`) })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/customer\/area$/);
  await expect(page.getByRole("heading", { name: new RegExp(`Olá, Cliente`) })).toBeVisible();
});

test("cliente vê apenas suas ordens e um histórico sem dados internos", async ({
  page,
  admin,
  database,
  runId,
}) => {
  const customer = await createE2ECustomerAccount(runId, {
    name: `Cliente proprietário ${runId}`,
  });
  const otherCustomer = await createE2ECustomerAccount(runId, {
    name: `Cliente externo ${runId}`,
  });
  const ownOrder = await createE2EServiceOrder({
    customerId: customer.customer.id,
    createdById: admin.id,
    runId,
    title: `Atendimento autorizado ${runId}`,
    status: "IN_PROGRESS",
  });
  const otherOrder = await createE2EServiceOrder({
    customerId: otherCustomer.customer.id,
    createdById: admin.id,
    runId,
    title: `Atendimento de outro cliente ${runId}`,
  });
  const internalMarker = `Atualização interna restrita ${runId}`;
  const internalNote = `Nota interna restrita ${runId}`;

  await database.serviceOrderEvent.createMany({
    data: [
      { serviceOrderId: ownOrder.id, type: "CREATED", actorId: admin.id },
      {
        serviceOrderId: ownOrder.id,
        type: "OPERATIONAL_UPDATED",
        actorId: admin.id,
        changedFields: ["description", internalMarker],
      },
      {
        serviceOrderId: ownOrder.id,
        type: "STATUS_CHANGED",
        actorId: admin.id,
        previousStatus: "OPEN",
        newStatus: "IN_PROGRESS",
      },
    ],
  });
  await database.serviceOrderNote.create({
    data: {
      serviceOrderId: ownOrder.id,
      authorId: admin.id,
      content: internalNote,
    },
  });

  await loginCustomer(page, customer);
  await expect(page.getByRole("link", { name: ownOrder.title })).toBeVisible();
  await expect(page.getByText(otherOrder.title, { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: ownOrder.title }).click();
  await expect(page.getByRole("heading", { name: ownOrder.title })).toBeVisible();
  await expect(page.getByLabel("Histórico da ordem de serviço")).toContainText(
    "Status alterado de Aberta para Em andamento",
  );
  await expect(page.getByText(internalMarker, { exact: true })).toHaveCount(0);
  await expect(page.getByText(internalNote, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Notas internas" })).toHaveCount(0);
  await expect(page.getByText(admin.name, { exact: true })).toHaveCount(0);

  const ownEvents = await page.request.get(
    `${API_ORIGIN}/auth/customer/service-orders/${ownOrder.id}/events`,
  );
  expect(ownEvents.status()).toBe(200);
  const ownEventsBody = await ownEvents.json();
  expect(JSON.stringify(ownEventsBody)).not.toContain("OPERATIONAL_UPDATED");
  expect(JSON.stringify(ownEventsBody)).not.toContain(internalMarker);
  expect(JSON.stringify(ownEventsBody)).not.toContain(admin.name);
  expect(JSON.stringify(ownEventsBody)).not.toContain(internalNote);

  const unavailableNotes = await page.request.get(
    `${API_ORIGIN}/auth/customer/service-orders/${ownOrder.id}/notes`,
  );
  expect(unavailableNotes.status()).toBe(404);

  const blockedDetail = await page.request.get(
    `${API_ORIGIN}/auth/customer/service-orders/${otherOrder.id}`,
  );
  const blockedEvents = await page.request.get(
    `${API_ORIGIN}/auth/customer/service-orders/${otherOrder.id}/events`,
  );
  expect(blockedDetail.status()).toBe(404);
  expect(blockedEvents.status()).toBe(404);
});

test("recuperação troca a senha, revoga a sessão e logout protege o portal", async ({
  page,
  database,
  runId,
}) => {
  const originalPassword = `E2e-${runId}-Original-Aa1!`;
  const newPassword = `E2e-${runId}-Nova-Aa1!`;
  const customer = await createE2ECustomerAccount(runId, {
    password: originalPassword,
  });

  await loginCustomer(page, customer);
  await page.goto("/customer/forgot-password");
  await page.getByRole("textbox", { name: "E-mail *" }).fill(customer.email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(page.getByRole("status")).toContainText("enviaremos instruções");
  const resetToken = await readE2EOutboxToken("CUSTOMER_PASSWORD_RESET", customer.email);

  await page.goto(`/customer/reset-password?token=${encodeURIComponent(resetToken)}`);
  await page.getByRole("textbox", { name: "Nova senha *", exact: true }).fill(newPassword);
  await page.getByRole("textbox", { name: "Confirmar nova senha *" }).fill(newPassword);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByRole("status")).toContainText("Senha redefinida com sucesso");
  await expect(database.customerSession.count({ where: { revokedAt: { not: null } } })).resolves.toBeGreaterThan(0);

  await page.goto("/customer/login");
  await page.getByRole("textbox", { name: "E-mail *" }).fill(customer.email);
  await page.getByRole("textbox", { name: "Senha *" }).fill(originalPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toContainText("E-mail ou senha inválidos");

  await page.getByRole("textbox", { name: "Senha *" }).fill(newPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/customer\/area$/);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/customer\/login$/);

  await page.goto("/customer/area");
  await expect(page).toHaveURL(/\/customer\/login$/);
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
