import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const PROXY_CLIENT_IP_HEADER = "x-os-system-client-ip";
export const PROXY_TIMESTAMP_HEADER = "x-os-system-proxy-timestamp";
export const PROXY_SIGNATURE_HEADER = "x-os-system-proxy-signature";
export const PROXY_SIGNATURE_MAX_AGE_MS = 60_000;
export const MIN_PROXY_SECRET_BYTES = 32;

export function normalizeIpAddress(rawValue: string | undefined): string | null {
  if (!rawValue) return null;

  let value = rawValue.trim();
  if (!value || value.includes(",") || value.includes("%")) return null;

  if (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1);
  }

  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mappedIpv4 && isIP(mappedIpv4[1]) === 4) {
    return mappedIpv4[1];
  }

  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;

  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

export function assertValidProxySecret(secret: string | undefined): asserts secret is string {
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_PROXY_SECRET_BYTES) {
    throw new Error(
      `INTERNAL_PROXY_SECRET deve possuir ao menos ${MIN_PROXY_SECRET_BYTES} bytes`,
    );
  }
}

export function proxySignaturePayload(input: {
  timestamp: string;
  method: string;
  pathAndQuery: string;
  clientIp: string;
}): string {
  return [
    input.timestamp,
    input.method.toUpperCase(),
    input.pathAndQuery,
    input.clientIp,
  ].join("\n");
}

export function createProxySignature(
  secret: string,
  input: Parameters<typeof proxySignaturePayload>[0],
): string {
  return createHmac("sha256", secret)
    .update(proxySignaturePayload(input), "utf8")
    .digest("hex");
}

export function safeSignatureMatch(received: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;

  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}
