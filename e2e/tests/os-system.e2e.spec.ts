import type { Response } from "@playwright/test";

import { expect, test, type Page } from "../support/fixtures.js";
import {
  createE2ECustomer,
  createE2EServiceOrder,
  createE2EUser,
  verifyStoredPassword,
  type E2EUser,
  type InternalUserRole,
} from "../support/database.js";

const API_ORIGIN = "http://127.0.0.1:3333";

async function login(page: Page, user: Pick<E2EUser, "email" | "password" | "name">) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Entrar na central" })).toBeVisible();
  await page.getByRole("textbox", { name: "E-mail *" }).fill(user.email);
  await page.getByRole("textbox", { name: "Senha *" }).fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.getByLabel("Usuário conectado")).toContainText(user.name);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
}

async function waitForWriteResponse(
  page: Page,
  method: string,
  pathname: string,
): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === method && url.pathname === pathname;
  });
}

async function createInternalUserThroughUI(
  page: Page,
  user: {
    name: string;
    email: string;
    password: string;
    role: InternalUserRole;
  },
) {
  await page.goto("/users");
  await page.getByRole("link", { name: "Novo usuário" }).click();
  await page.getByRole("textbox", { name: "Nome *" }).fill(user.name);
  await page.getByRole("textbox", { name: "E-mail *" }).fill(user.email);
  await page
    .getByRole("textbox", { name: "Senha temporária *" })
    .fill(user.password);
  await page.getByLabel("Papel *").selectOption(user.role);

  const responsePromise = waitForWriteResponse(page, "POST", "/users");
  await page.getByRole("button", { name: "Criar usuário" }).click();
  const response = await responsePromise;

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body).not.toHaveProperty("password");
  expect(body).toMatchObject({ name: user.name, email: user.email, role: user.role });

  await expect(page).toHaveURL(/\/users$/);
  const row = page.getByRole("row").filter({ hasText: user.email });
  await expect(row).toContainText(user.name);
  await expect(row).toContainText(
    user.role === "ATTENDANT" ? "Atendente" : "Técnico",
  );
  await expect(page.getByText(user.password, { exact: true })).toHaveCount(0);
}

test("ciclo completo de equipe, cliente e ordem de serviço", async ({
  page,
  admin,
  database,
  runId,
}) => {
  const attendant = {
    name: `Atendente E2E ${runId}`,
    email: `attendant-${runId}@example.test`,
    password: `E2e-Attendant-${runId}-Aa1!`,
    role: "ATTENDANT" as const,
  };
  const technician = {
    name: `Técnico E2E ${runId}`,
    email: `technician-${runId}@example.test`,
    password: `E2e-Technician-${runId}-Aa1!`,
    role: "TECHNICIAN" as const,
  };
  const customerName = `Cliente E2E ${runId}`;
  const customerEmail = `customer-${runId}@example.test`;
  const orderTitle = `Ordem principal E2E ${runId}`;
  const internalNote = `Orientação interna E2E ${runId}`;

  await test.step("autentica o administrador pela interface", async () => {
    await login(page, admin);
    await expect(page.getByRole("heading", { name: /Olá, Administrador/ })).toBeVisible();
  });

  await test.step("cria atendente e técnico pela gestão de usuários", async () => {
    await createInternalUserThroughUI(page, attendant);
    await createInternalUserThroughUI(page, technician);

    const storedAttendant = await database.user.findUnique({
      where: { email: attendant.email },
    });
    const storedTechnician = await database.user.findUnique({
      where: { email: technician.email },
    });

    expect(storedAttendant).toMatchObject({
      name: attendant.name,
      role: "ATTENDANT",
    });
    expect(storedTechnician).toMatchObject({
      name: technician.name,
      role: "TECHNICIAN",
    });
    expect(storedAttendant?.password).not.toBe(attendant.password);
    expect(storedTechnician?.password).not.toBe(technician.password);
    expect(
      await verifyStoredPassword(storedAttendant!.password, attendant.password),
    ).toBe(true);
    expect(
      await verifyStoredPassword(storedTechnician!.password, technician.password),
    ).toBe(true);
  });

  const customerId = await test.step("cria e lista o cliente", async () => {
    await page.goto("/customers/new");
    await page.getByRole("textbox", { name: "Nome *" }).fill(customerName);
    await page.getByRole("textbox", { name: "E-mail" }).fill(customerEmail);
    await page.getByRole("textbox", { name: "Telefone" }).fill("(11) 99999-0000");
    await page.getByRole("textbox", { name: "Endereço" }).fill("Rua E2E, 123");

    const responsePromise = waitForWriteResponse(page, "POST", "/customers");
    await page.getByRole("button", { name: "Criar cliente" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const body = await response.json();

    await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByRole("row").filter({ hasText: customerEmail })).toContainText(
      customerName,
    );

    const stored = await database.customer.findUnique({ where: { id: body.id } });
    expect(stored).toMatchObject({ name: customerName, email: customerEmail });
    return body.id as string;
  });

  const orderId = await test.step("cria a ordem e confirma os relacionamentos", async () => {
    await page.goto("/service-orders/new");
    await page.getByRole("textbox", { name: "Título *" }).fill(orderTitle);
    await page
      .getByRole("textbox", { name: "Descrição *" })
      .fill("Falha de conectividade validada pelo Playwright Test.");
    await page.getByLabel("Cliente *").selectOption({ label: customerName });
    await page.getByLabel("Prioridade *").selectOption("HIGH");

    const responsePromise = waitForWriteResponse(page, "POST", "/service-orders");
    await page.getByRole("button", { name: "Criar ordem" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const body = await response.json();

    await expect(page.getByRole("heading", { name: orderTitle })).toBeVisible();
    await expect(page.getByText("Alta", { exact: true })).toBeVisible();
    await expect(page.getByText(customerName, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Histórico operacional" })).toBeVisible();
    await expect(page.getByText("Ordem de serviço criada", { exact: true })).toBeVisible();

    const stored = await database.serviceOrder.findUnique({ where: { id: body.id } });
    expect(stored).toMatchObject({
      title: orderTitle,
      customerId,
      createdById: admin.id,
      status: "OPEN",
      priority: "HIGH",
    });
    return body.id as string;
  });

  const storedTechnician = await database.user.findUniqueOrThrow({
    where: { email: technician.email },
  });
  const otherTechnician = await createE2EUser("TECHNICIAN", runId, {
    name: `Outro técnico E2E ${runId}`,
  });
  const otherOrder = await createE2EServiceOrder({
    customerId,
    createdById: admin.id,
    technicianId: otherTechnician.id,
    title: `Ordem de outro técnico ${runId}`,
    runId,
  });
  const unassignedOrder = await createE2EServiceOrder({
    customerId,
    createdById: admin.id,
    title: `Ordem sem atribuição ${runId}`,
    runId,
  });

  await test.step("atribui o técnico pela página de detalhes", async () => {
    await page.goto(`/service-orders/${orderId}`);
    await page
      .getByLabel("Atribuir técnico")
      .selectOption({ label: technician.name });
    await expect(page.getByRole("status")).toContainText("Técnico atualizado.");
    await expect(page.getByLabel("Atribuir técnico")).toHaveValue(
      storedTechnician.id,
    );
    await expect(page.getByText(`Técnico atribuído: ${technician.name}`, { exact: true })).toBeVisible();
    expect(
      await database.serviceOrder.findUniqueOrThrow({ where: { id: orderId } }),
    ).toMatchObject({ technicianId: storedTechnician.id });
  });

  await test.step("registra e preserva uma nota interna após recarregar", async () => {
    await page.getByRole("textbox", { name: "Nova nota interna" }).fill(internalNote);
    const responsePromise = waitForWriteResponse(
      page,
      "POST",
      `/service-orders/${orderId}/notes`,
    );
    await page.getByRole("button", { name: "Registrar nota" }).click();
    expect((await responsePromise).status()).toBe(201);
    await expect(page.getByText("Nota interna registrada com sucesso.", { exact: true }))
      .toBeVisible();
    const notesSection = page.getByRole("region", { name: "Notas internas" });
    await expect(notesSection.getByText(internalNote, { exact: true })).toBeVisible();
    await expect(notesSection.getByText(admin.name, { exact: true })).toBeVisible();
    await expect(notesSection.locator("time")).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole("region", { name: "Notas internas" })
      .getByText(internalNote, { exact: true })).toBeVisible();
    await expect(database.serviceOrderNote.findFirst({
      where: { serviceOrderId: orderId, content: internalNote },
    })).resolves.toMatchObject({ authorId: admin.id });
  });

  await test.step("técnico acessa somente a fila atribuída", async () => {
    await logout(page);
    await login(page, technician);
    await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0);

    await page.goto("/service-orders");
    await expect(page.getByText("Sua fila atribuída")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(orderTitle) })).toBeVisible();
    await expect(page.getByText(otherOrder.title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(unassignedOrder.title, { exact: true })).toHaveCount(0);

    const blockedNotes = await page.request.get(
      `${API_ORIGIN}/service-orders/${otherOrder.id}/notes`,
    );
    expect(blockedNotes.status()).toBe(404);
  });

  await test.step("executa todas as transições válidas do técnico", async () => {
    await page.getByRole("link", { name: new RegExp(orderTitle) }).click();
    const status = page.getByLabel("Alterar status");

    for (const [value, label] of [
      ["IN_PROGRESS", "Em andamento"],
      ["WAITING", "Aguardando"],
      ["IN_PROGRESS", "Em andamento"],
    ] as const) {
      await status.selectOption(value);
      await expect(status).toHaveValue(value);
      await expect(page.getByRole("status")).toContainText("Status atualizado.");
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    await status.selectOption("COMPLETED");
    await expect(page.getByText("Concluída", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Alterar status")).toHaveCount(0);
    await expect(page.getByText("Status alterado de Em andamento para Concluída", { exact: true })).toBeVisible();

    const stored = await database.serviceOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(stored).toMatchObject({
      status: "COMPLETED",
      technicianId: storedTechnician.id,
    });
  });

  await logout(page);
});

test("rota interna sem sessão redireciona para o login", async ({ page }) => {
  await page.goto("/users");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("login inválido apresenta erro visível", async ({ page, runId }) => {
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "E-mail *" })
    .fill(`inexistente-${runId}@example.test`);
  await page.getByRole("textbox", { name: "Senha *" }).fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toContainText("Credenciais inválidas");
  await expect(page).toHaveURL(/\/login$/);
});

test("listagem vazia informa que não existem ordens", async ({ page, admin }) => {
  await login(page, admin);
  await page.goto("/service-orders");
  await expect(
    page.getByRole("heading", { name: "Não há ordens de serviço cadastradas." }),
  ).toBeVisible();
  await expect(page.getByText("Quando uma ordem for criada, ela aparecerá aqui.")).toBeVisible();
});

test("listagem exibe e filtra ordens por status", async ({
  page,
  admin,
  runId,
}) => {
  const customer = await createE2ECustomer(runId);
  const openOrder = await createE2EServiceOrder({
    customerId: customer.id,
    createdById: admin.id,
    title: `Ordem aberta ${runId}`,
    status: "OPEN",
    runId,
  });
  const completedOrder = await createE2EServiceOrder({
    customerId: customer.id,
    createdById: admin.id,
    title: `Ordem concluída ${runId}`,
    status: "COMPLETED",
    runId,
  });

  await login(page, admin);
  await page.goto("/service-orders");
  await expect(page.getByText(openOrder.title, { exact: true })).toBeVisible();
  await expect(page.getByText(completedOrder.title, { exact: true })).toBeVisible();

  await page.getByLabel("Filtrar por status").selectOption("COMPLETED");
  await expect(page.getByText(completedOrder.title, { exact: true })).toBeVisible();
  await expect(page.getByText(openOrder.title, { exact: true })).toHaveCount(0);
});

test("listagem pagina as ordens e preserva os filtros ativos", async ({
  page,
  admin,
  runId,
}) => {
  const customer = await createE2ECustomer(runId);
  const searchTerm = `Página E2E ${runId}`;
  await Promise.all(Array.from({ length: 21 }, (_, index) => (
    createE2EServiceOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: `${searchTerm} ${index + 1}`,
      status: "OPEN",
      runId,
    })
  )));

  await login(page, admin);
  await page.goto("/service-orders");
  const search = page.getByRole("searchbox", { name: "Buscar ordens de serviço" });
  await search.fill(searchTerm);
  await page.getByLabel("Filtrar por status").selectOption("OPEN");

  await expect(page.getByText("Página 1 de 2 · 21 ordem(ns)")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: searchTerm })).toHaveCount(20);
  const firstPageTitle = await page.getByRole("row")
    .filter({ hasText: searchTerm })
    .first()
    .locator(".order-title")
    .textContent();
  await expect(page.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  await page.getByRole("button", { name: "Próxima página" }).click();

  await expect(page.getByText("Página 2 de 2 · 21 ordem(ns)")).toBeVisible();
  await expect(search).toHaveValue(searchTerm);
  await expect(page.getByLabel("Filtrar por status")).toHaveValue("OPEN");
  await expect(page.getByText(firstPageTitle!, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: searchTerm })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Próxima página" })).toBeDisabled();
});

test("listagem pagina clientes e preserva a busca", async ({
  page,
  admin,
  runId,
}) => {
  const searchTerm = `Cliente página ${runId}`;
  await Promise.all(Array.from({ length: 21 }, (_, index) => (
    createE2ECustomer(runId, `${searchTerm} ${index + 1}`)
  )));

  await login(page, admin);
  await page.goto("/customers");
  const search = page.getByRole("searchbox", { name: "Buscar clientes" });
  await search.fill(searchTerm);

  await expect(page.getByText("Página 1 de 2 · 21 cliente(s)")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: searchTerm })).toHaveCount(20);
  await page.getByRole("button", { name: "Próxima página" }).click();

  await expect(page.getByText("Página 2 de 2 · 21 cliente(s)")).toBeVisible();
  await expect(search).toHaveValue(searchTerm);
  await expect(page.getByRole("row").filter({ hasText: searchTerm })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Próxima página" })).toBeDisabled();
});

test("relatórios operacionais carregam indicadores, aplicam filtros e tratam período vazio", async ({
  page,
  admin,
  database,
  runId,
}) => {
  const customer = await createE2ECustomer(runId);
  await createE2EServiceOrder({
    customerId: customer.id,
    createdById: admin.id,
    title: `Relatório aberto ${runId}`,
    status: "OPEN",
    priority: "HIGH",
    runId,
  });
  const completed = await createE2EServiceOrder({
    customerId: customer.id,
    createdById: admin.id,
    title: `Relatório concluído ${runId}`,
    status: "COMPLETED",
    priority: "MEDIUM",
    runId,
  });
  await database.serviceOrderEvent.create({
    data: {
      serviceOrderId: completed.id,
      actorId: admin.id,
      type: "STATUS_CHANGED",
      previousStatus: "IN_PROGRESS",
      newStatus: "COMPLETED",
    },
  });

  await login(page, admin);
  await page.getByRole("link", { name: "Relatórios" }).click();
  await expect(page.getByRole("heading", { name: "Relatórios operacionais" })).toBeVisible();
  await expect(page.getByText("Criadas no período", { exact: true })).toBeVisible();
  await expect(page.getByText("Concluídas no período", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ordens por status atual" }))
    .toContainText("Aberta");
  await expect(page.getByRole("region", { name: "Carga atual por técnico" }))
    .toContainText("Sem técnico atribuído");

  await page.getByLabel("Status atual", { exact: true }).selectOption("COMPLETED");
  const filteredResponse = waitForWriteResponse(page, "GET", "/reports/operations");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  expect((await filteredResponse).status()).toBe(200);
  const completedRow = page.getByRole("region", { name: "Ordens por status atual" })
    .getByRole("listitem")
    .filter({ hasText: "Concluída" });
  await expect(completedRow).toContainText("1");

  await page.getByLabel("Data inicial").fill("2000-01-01");
  await page.getByLabel("Data final").fill("2000-01-02");
  const emptyResponse = waitForWriteResponse(page, "GET", "/reports/operations");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  expect((await emptyResponse).status()).toBe(200);
  await expect(page.getByRole("heading", {
    name: "Nenhuma atividade encontrada no período",
  })).toBeVisible();
});

test("atendente não acessa a gestão administrativa de usuários", async ({
  page,
  runId,
}) => {
  const attendant = await createE2EUser("ATTENDANT", runId);
  await login(page, attendant);
  await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0);

  let usersEndpointRequested = false;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:3333" && url.pathname === "/users") {
      usersEndpointRequested = true;
    }
  });
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Acesso não permitido" })).toBeVisible();
  expect(usersEndpointRequested).toBe(false);
});

test("técnico não acessa relatórios globais nem consulta o endpoint", async ({
  page,
  runId,
}) => {
  const technician = await createE2EUser("TECHNICIAN", runId);
  await login(page, technician);
  await expect(page.getByRole("link", { name: "Relatórios" })).toHaveCount(0);

  let reportEndpointRequested = false;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === API_ORIGIN && url.pathname === "/reports/operations") {
      reportEndpointRequested = true;
    }
  });
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Acesso não permitido" })).toBeVisible();
  expect(reportEndpointRequested).toBe(false);
});
