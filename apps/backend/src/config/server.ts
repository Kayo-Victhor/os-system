export const DEFAULT_SERVER_PORT = 3333;

export function resolveServerPort(rawPort = process.env.PORT): number {
  if (rawPort === undefined || rawPort === "") return DEFAULT_SERVER_PORT;

  if (!/^\d+$/.test(rawPort)) {
    throw new Error("PORT deve ser um número inteiro entre 1 e 65535");
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT deve ser um número inteiro entre 1 e 65535");
  }

  return port;
}
