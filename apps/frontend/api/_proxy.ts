import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const API_PREFIX = "/api";
const PROXY_FUNCTION_PATH = "/api/proxy";
const REWRITE_PATH_PARAMETER = "__os_proxy_path";
const CLIENT_IP_HEADER = "x-os-system-client-ip";
const TIMESTAMP_HEADER = "x-os-system-proxy-timestamp";
const SIGNATURE_HEADER = "x-os-system-proxy-signature";
const MIN_PROXY_SECRET_BYTES = 32;

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "origin",
  "referer",
  "user-agent",
  "x-csrf-token",
]);

const OMITTED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface ProxyEnvironment {
  API_PROXY_TARGET?: string;
  INTERNAL_PROXY_SECRET?: string;
}

type FetchImplementation = typeof fetch;

function decodeRewritePath(rawValue: string): string | null {
  try {
    const value = decodeURIComponent(rawValue.replace(/\+/g, "%20"));
    const hasUnsafeSegment = value
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..");
    if (
      !value
      || value.startsWith("/")
      || value.includes("\\")
      || value.includes("\0")
      || value.includes("?")
      || value.includes("#")
      || hasUnsafeSegment
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * Vercel rewrites /api/:proxyPath* to the stable /api/proxy Function and
 * injects the captured path as the first query parameter. Remove only that
 * internal parameter while leaving every byte of the browser query intact;
 * the exact same path/query is then used both for fetch and for the HMAC.
 */
export function resolveUpstreamPathAndQuery(requestUrl: string): string | null {
  const incomingUrl = new URL(requestUrl);

  if (incomingUrl.pathname === PROXY_FUNCTION_PATH) {
    const rawParameters = incomingUrl.search.length > 1
      ? incomingUrl.search.slice(1).split("&")
      : [];
    const forwardedParameters: string[] = [];
    let rewrittenPath: string | null = null;

    for (const rawParameter of rawParameters) {
      const separatorIndex = rawParameter.indexOf("=");
      const rawName = separatorIndex === -1
        ? rawParameter
        : rawParameter.slice(0, separatorIndex);
      const rawValue = separatorIndex === -1
        ? ""
        : rawParameter.slice(separatorIndex + 1);

      let name: string;
      try {
        name = decodeURIComponent(rawName.replace(/\+/g, "%20"));
      } catch {
        return null;
      }

      if (rewrittenPath === null && name === REWRITE_PATH_PARAMETER) {
        rewrittenPath = decodeRewritePath(rawValue);
        if (rewrittenPath === null) return null;
        continue;
      }

      forwardedParameters.push(rawParameter);
    }

    if (rewrittenPath === null) return null;
    const query = forwardedParameters.length > 0
      ? `?${forwardedParameters.join("&")}`
      : "";
    return `/${rewrittenPath}${query}`;
  }

  if (!incomingUrl.pathname.startsWith(`${API_PREFIX}/`)) return null;
  return `${incomingUrl.pathname.slice(API_PREFIX.length)}${incomingUrl.search}`;
}

export function normalizeProxyIp(rawValue: string | null): string | null {
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

function readProxyConfiguration(environment: ProxyEnvironment): {
  targetOrigin: string;
  secret: string;
} {
  const secret = environment.INTERNAL_PROXY_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_PROXY_SECRET_BYTES) {
    throw new Error("Configuração interna do proxy indisponível");
  }

  const rawTarget = environment.API_PROXY_TARGET;
  if (!rawTarget) throw new Error("Configuração interna do proxy indisponível");

  const target = new URL(rawTarget);
  const isLocalTarget = target.hostname === "localhost" || target.hostname === "127.0.0.1";
  if ((target.protocol !== "https:" && !isLocalTarget) || target.username || target.password) {
    throw new Error("Configuração interna do proxy inválida");
  }

  if (target.pathname !== "/" || target.search || target.hash) {
    throw new Error("API_PROXY_TARGET deve conter somente a origem do backend");
  }

  return { targetOrigin: target.origin, secret };
}

function signaturePayload(input: {
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

function signedRequestHeaders(
  request: Request,
  secret: string,
  timestamp: string,
  clientIp: string,
  pathAndQuery: string,
): Headers {
  const headers = new Headers();

  for (const [name, value] of request.headers) {
    if (FORWARDED_REQUEST_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }

  const signature = createHmac("sha256", secret)
    .update(signaturePayload({
      timestamp,
      method: request.method,
      pathAndQuery,
      clientIp,
    }), "utf8")
    .digest("hex");

  headers.set(CLIENT_IP_HEADER, clientIp);
  headers.set(TIMESTAMP_HEADER, timestamp);
  headers.set(SIGNATURE_HEADER, signature);
  return headers;
}

function proxyResponse(upstream: Response): Response {
  const headers = new Headers();
  for (const [name, value] of upstream.headers) {
    if (!OMITTED_RESPONSE_HEADERS.has(name.toLowerCase())) {
      headers.append(name, value);
    }
  }

  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function proxyApiRequest(
  request: Request,
  environment: ProxyEnvironment,
  fetchImplementation: FetchImplementation = fetch,
  now: () => number = Date.now,
): Promise<Response> {
  try {
    const { targetOrigin, secret } = readProxyConfiguration(environment);
    const upstreamPathAndQuery = resolveUpstreamPathAndQuery(request.url);
    if (!upstreamPathAndQuery) {
      return Response.json({ error: "Rota não encontrada" }, { status: 404 });
    }

    // Vercel documents this header as its own copy of the client address.
    // Unlike X-Forwarded-For supplied by a browser, this value is set at the
    // platform boundary before the function executes.
    const clientIp = normalizeProxyIp(request.headers.get("x-vercel-forwarded-for"));
    if (!clientIp) {
      return Response.json({ error: "Não foi possível processar a requisição" }, { status: 400 });
    }

    const timestamp = String(now());
    const headers = signedRequestHeaders(
      request,
      secret,
      timestamp,
      clientIp,
      upstreamPathAndQuery,
    );
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const body = hasBody ? await request.arrayBuffer() : undefined;

    const upstream = await fetchImplementation(`${targetOrigin}${upstreamPathAndQuery}`, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
    });

    return proxyResponse(upstream);
  } catch (error) {
    console.error("Falha no proxy da API", {
      error: error instanceof Error ? error.name : "erro desconhecido",
    });
    return Response.json({ error: "Não foi possível acessar o serviço" }, { status: 502 });
  }
}
