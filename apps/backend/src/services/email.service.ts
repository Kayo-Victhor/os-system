import { URL } from "node:url";

export class EmailDeliveryError extends Error {
  constructor() {
    super("Não foi possível enviar o e-mail de verificação");
    this.name = "EmailDeliveryError";
  }
}

interface LinkEmail { to: string; token: string; }
interface TestEmail {
  to: string;
  passwordResetUrl?: string;
  customerRegistrationUrl?: string;
  customerPasswordResetUrl?: string;
}

const testOutbox: TestEmail[] = [];
const BREVO_SEND_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

function linkUrl(path: string, token: string) {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:5173";
  let url: URL;
  try { url = new URL(path, baseUrl); } catch { throw new EmailDeliveryError(); }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new EmailDeliveryError();
  url.searchParams.set("token", token);
  return url.toString();
}

async function deliverEmail(to: string, subject: string, htmlContent: string) {
  if (process.env.NODE_ENV === "test") return;
  if (process.env.EMAIL_PROVIDER !== "brevo") throw new EmailDeliveryError();
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !isEmailAddress(from)) throw new EmailDeliveryError();
  try {
    const response = await fetch(BREVO_SEND_EMAIL_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: { name: "OS System", email: from }, to: [{ email: to }], subject, htmlContent }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new EmailDeliveryError();
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  }
}

export async function sendPasswordResetEmail({ to, token }: LinkEmail) {
  const url = linkUrl("/resetar-senha", token);
  if (process.env.NODE_ENV === "test") { testOutbox.push({ to, passwordResetUrl: url }); return; }
  await deliverEmail(to, "Redefina sua senha no OS System", '<p>Recebemos uma solicitação para redefinir sua senha no OS System.</p><p>Este link é válido por 60 minutos: <a href="' + url + '">Redefinir senha</a>.</p><p>Se você não solicitou esta alteração, ignore esta mensagem.</p>');
}

export async function sendCustomerAccountPasswordResetEmail({ to, token }: LinkEmail) {
  const url = linkUrl("/customer/reset-password", token);
  if (process.env.NODE_ENV === "test") {
    testOutbox.push({
      to,
      customerPasswordResetUrl: url,
    });
    return;
  }

  await deliverEmail(
    to,
    "Redefinição de senha da conta do cliente",
    '<h1>Redefina sua senha</h1>' +
      '<p>Recebemos uma solicitação para redefinir a senha da sua conta de cliente no OS System.</p>' +
      '<p>Este link é válido por 60 minutos: <a href="' + url + '">Redefinir senha</a>.</p>' +
      '<p>Se você não solicitou esta alteração, ignore esta mensagem.</p>',
  );
}

export async function sendCustomerRegistrationVerificationEmail({ to, token }: LinkEmail) {
  const url = linkUrl("/confirmar-cadastro", token);
  if (process.env.NODE_ENV === "test") {
    testOutbox.push({ to, customerRegistrationUrl: url });
    return;
  }

  await deliverEmail(
    to,
    "Confirme seu cadastro de cliente no OS System",
    '<h1>Confirme seu cadastro</h1>' +
      '<p>Recebemos uma solicitação de cadastro de cliente no OS System.</p>' +
      '<p>Este link é válido por 24 horas: <a href="' + url + '">Confirmar cadastro</a>.</p>' +
      '<p>Se você não solicitou este cadastro, ignore esta mensagem.</p>',
  );
}

function isEmailAddress(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export function getTestEmailOutbox(): readonly TestEmail[] { return testOutbox; }
export function clearTestEmailOutbox() { testOutbox.length = 0; }
