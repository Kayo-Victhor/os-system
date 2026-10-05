import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailDeliveryError, sendCustomerAccountPasswordResetEmail, sendCustomerRegistrationVerificationEmail, sendPasswordResetEmail, sendVerificationEmail } from "../src/services/email.service.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

function configureBrevo() {
  process.env.NODE_ENV = "development";
  process.env.EMAIL_PROVIDER = "brevo";
  process.env.BREVO_API_KEY = "brevo-secret-that-must-not-leak";
  process.env.EMAIL_FROM = "remetente-verificado@example.com";
  process.env.APP_BASE_URL = "http://localhost:5173";
}

describe("serviço de e-mail da Brevo", () => {
  it("envia o payload de confirmação para o endpoint oficial", async () => {
    configureBrevo();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "id" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendVerificationEmail({ to: "cliente@example.com", token: "token-seguro" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.headers).toEqual({
      "api-key": "brevo-secret-that-must-not-leak",
      "Content-Type": "application/json",
    });
    const payload = JSON.parse(options.body);
    expect(payload).toMatchObject({
      sender: { name: "OS System", email: "remetente-verificado@example.com" },
      to: [{ email: "cliente@example.com" }],
      subject: "Confirme seu e-mail no OS System",
    });
    expect(payload.htmlContent).toContain("http://localhost:5173/verificar-email?token=token-seguro");
  });

  it("envia a mensagem de redefinição com link e prazo", async () => {
    configureBrevo();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "id" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendPasswordResetEmail({ to: "cliente@example.com", token: "token-seguro" });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.subject).toBe("Redefina sua senha no OS System");
    expect(payload.htmlContent).toContain("60 minutos");
    expect(payload.htmlContent).toContain("http://localhost:5173/resetar-senha?token=token-seguro");
    expect(payload.htmlContent).toContain("ignore");
  });

  it("envia redefinição específica da conta de cliente", async () => {
    configureBrevo();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "id" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendCustomerAccountPasswordResetEmail({
      to: "cliente@example.com",
      token: "token-cliente-seguro",
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.to).toEqual([{ email: "cliente@example.com" }]);
    expect(payload.subject).toBe("Redefinição de senha da conta do cliente");
    expect(payload.htmlContent).toContain("60 minutos");
    expect(payload.htmlContent).toContain(
      "http://localhost:5173/customer/reset-password?token=token-cliente-seguro",
    );
    expect(payload.htmlContent).toContain("ignore");
  });

  it("envia confirmação específica de cadastro pendente", async () => {
    configureBrevo();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "id" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendCustomerRegistrationVerificationEmail({
      to: "novo-cliente@example.com",
      token: "token-pendente-seguro",
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.to).toEqual([{ email: "novo-cliente@example.com" }]);
    expect(payload.subject).toBe("Confirme seu cadastro de cliente no OS System");
    expect(payload.htmlContent).toContain("24 horas");
    expect(payload.htmlContent).toContain("http://localhost:5173/confirmar-cadastro?token=token-pendente-seguro");
    expect(payload.htmlContent).toContain("ignore");
  });

  it.each([400, 401, 403, 429, 500, 503])("normaliza erro HTTP %i sem expor segredos", async (status) => {
    configureBrevo();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));

    await expect(sendVerificationEmail({ to: "cliente@example.com", token: "token-seguro" })).rejects.toEqual(
      expect.objectContaining({ name: "EmailDeliveryError", message: "Não foi possível enviar o e-mail de verificação" }),
    );
  });

  it.each([new Error("network unavailable"), new DOMException("Request aborted", "AbortError")])(
    "normaliza falha de rede ou timeout sem registrar chave ou token",
    async (error) => {
      configureBrevo();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

      await expect(sendVerificationEmail({ to: "cliente@example.com", token: "token-seguro" })).rejects.toBeInstanceOf(EmailDeliveryError);
      expect(consoleError).not.toHaveBeenCalled();
    },
  );
});
