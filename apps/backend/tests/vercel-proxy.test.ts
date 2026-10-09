import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizeProxyIp,
  proxyApiRequest,
} from "../../frontend/api/_proxy.js";
import {
  createProxySignature,
  PROXY_CLIENT_IP_HEADER,
  PROXY_SIGNATURE_HEADER,
  PROXY_TIMESTAMP_HEADER,
} from "../src/lib/proxy-signature.js";

const environment = {
  API_PROXY_TARGET: "https://backend.example.com",
  INTERNAL_PROXY_SECRET: "test-internal-proxy-secret-with-at-least-32-bytes",
};

describe("proxy server-side da Vercel", () => {
  it("reserva /api para a Function antes do fallback da SPA", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../frontend/vercel.json", import.meta.url), "utf8"),
    ) as { rewrites: Array<{ source: string; destination: string }> };
    const spaRewrite = config.rewrites.find(
      ({ destination }) => destination === "/index.html",
    );

    expect(spaRewrite).toBeDefined();
    const spaMatcher = new RegExp(`^${spaRewrite!.source}$`);
    expect(spaMatcher.test("/login")).toBe(true);
    expect(spaMatcher.test("/customer/login")).toBe(true);
    expect(spaMatcher.test("/customer/area")).toBe(true);
    expect(spaMatcher.test("/api/auth/login")).toBe(false);
    expect(spaMatcher.test("/api/auth/customer/login")).toBe(false);
    expect(spaMatcher.test("/api/auth/refresh")).toBe(false);
    expect(spaMatcher.test("/api/auth/customer/refresh")).toBe(false);
  });

  it("encaminha método, caminho, query, body e headers com assinatura válida", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => (
      Response.json({ ok: true }, { status: 201 })
    ));
    const request = new Request("https://frontend.example.com/api/auth/login?next=%2Fpainel", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "csrf_token=abc",
        "x-csrf-token": "abc",
        "x-vercel-forwarded-for": "203.0.113.42",
        "x-forwarded-for": "198.51.100.99",
        "x-real-ip": "192.0.2.99",
        [PROXY_CLIENT_IP_HEADER]: "192.0.2.1",
        [PROXY_SIGNATURE_HEADER]: "a".repeat(64),
      },
      body: JSON.stringify({ email: "teste@example.com" }),
    });

    const response = await proxyApiRequest(request, environment, fetchMock, () => 1_800_000_000_000);

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toBe("https://backend.example.com/auth/login?next=%2Fpainel");
    expect(init?.method).toBe("POST");
    expect(Buffer.from(init?.body as ArrayBuffer).toString("utf8")).toBe(
      JSON.stringify({ email: "teste@example.com" }),
    );

    const headers = init?.headers as Headers;
    expect(headers.get(PROXY_CLIENT_IP_HEADER)).toBe("203.0.113.42");
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect(headers.get("x-real-ip")).toBeNull();
    expect(headers.get("cookie")).toBe("csrf_token=abc");
    expect(headers.get("x-csrf-token")).toBe("abc");

    const timestamp = headers.get(PROXY_TIMESTAMP_HEADER)!;
    expect(headers.get(PROXY_SIGNATURE_HEADER)).toBe(createProxySignature(
      environment.INTERNAL_PROXY_SECRET,
      {
        timestamp,
        method: "POST",
        pathAndQuery: "/auth/login?next=%2Fpainel",
        clientIp: "203.0.113.42",
      },
    ));
  });

  it("preserva status, headers e múltiplos Set-Cookie", async () => {
    const upstreamHeaders = new Headers({ "content-type": "application/json" });
    upstreamHeaders.append("set-cookie", "access_token=one; Path=/; HttpOnly; Secure");
    upstreamHeaders.append("set-cookie", "csrf_token=two; Path=/; Secure");
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', {
      status: 202,
      headers: upstreamHeaders,
    }));
    const request = new Request("https://frontend.example.com/api/auth/login", {
      headers: { "x-vercel-forwarded-for": "203.0.113.42" },
    });

    const response = await proxyApiRequest(request, environment, fetchMock);

    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.getSetCookie()).toEqual([
      "access_token=one; Path=/; HttpOnly; Secure",
      "csrf_token=two; Path=/; Secure",
    ]);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejeita IP ausente, lista de IPs e rota fora de /api", async () => {
    const fetchMock = vi.fn();
    const missingIp = await proxyApiRequest(
      new Request("https://frontend.example.com/api/auth/me"),
      environment,
      fetchMock,
    );
    const ipList = await proxyApiRequest(
      new Request("https://frontend.example.com/api/auth/me", {
        headers: { "x-vercel-forwarded-for": "203.0.113.1, 198.51.100.2" },
      }),
      environment,
      fetchMock,
    );
    const wrongPath = await proxyApiRequest(
      new Request("https://frontend.example.com/auth/me", {
        headers: { "x-vercel-forwarded-for": "203.0.113.1" },
      }),
      environment,
      fetchMock,
    );

    expect(missingIp.status).toBe(400);
    expect(ipList.status).toBe(400);
    expect(wrongPath.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normaliza IPv4 mapeado e IPv6 antes de assinar", () => {
    expect(normalizeProxyIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeProxyIp("2001:0DB8:0000:0000:0000:0000:0000:0001")).toBe("2001:db8::1");
  });
});
