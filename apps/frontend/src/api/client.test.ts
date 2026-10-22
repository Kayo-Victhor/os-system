import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatchedEvents: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("window", {
    location: { origin: "http://localhost:5173" },
    setTimeout,
    clearTimeout,
    dispatchEvent: (event: Event) => { dispatchedEvents.push(event.type); },
  });
  dispatchedEvents.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function pendingUntilAborted(signal: AbortSignal | null | undefined) {
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

describe("cliente HTTP", () => {
  it("encerra uma leitura pendente para que a interface possa sair do loading", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      pendingUntilAborted(init?.signal)
    )));
    const { apiRequest } = await import("./client.ts");

    const request = apiRequest("/auth/me");
    const result = request.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(result).resolves.toMatchObject({ name: "TimeoutError" });
  });

  it("compartilha o refresh entre respostas 401 concorrentes", async () => {
    let releaseRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => { releaseRefresh = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return refreshResponse;
      return Promise.resolve(new Response(null, { status: 401 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { apiRequest } = await import("./client.ts");

    const first = apiRequest("/service-orders");
    const second = apiRequest("/customers");
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh"))).toHaveLength(1);
    });
    releaseRefresh?.(new Response(null, { status: 401 }));
    await Promise.allSettled([first, second]);

    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh"))).toHaveLength(1);
    expect(dispatchedEvents).toEqual([
      "os-system:session-expired",
      "os-system:session-expired",
    ]);
  });

  it("limpa um refresh travado apó timeout e permite uma nova tentativa", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/auth/refresh")) return pendingUntilAborted(init?.signal);
      return Promise.resolve(new Response(null, { status: 401 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { apiRequest } = await import("./client.ts");

    const first = apiRequest("/service-orders");
    const firstResult = first.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(firstResult).resolves.toMatchObject({ status: 401 });

    const second = apiRequest("/service-orders");
    const secondResult = second.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(secondResult).resolves.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/refresh"))).toHaveLength(2);
  });
});
