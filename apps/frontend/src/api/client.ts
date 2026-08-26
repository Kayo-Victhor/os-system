const API_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL ?? "http://localhost:3333")
  : "/api";
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
}

let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

function buildUrl(path: string, query?: Record<string, string | undefined>) {
  const url = new URL(`${API_URL}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}

async function rawRequest(path: string, options: RequestOptions) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (method !== "GET") {
    const csrfToken = readCookie("csrf_token");
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
  }

  return fetch(buildUrl(path, options.query), {
    method,
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Every authenticated request goes through here. On a 401 (expired access
 * token) it transparently tries POST /auth/refresh once and retries the
 * original request — the user never sees a loading flicker or has to log
 * in again mid-session just because 15 minutes passed. If the refresh
 * itself fails (refresh token expired/revoked too), the 401 propagates and
 * AuthContext handles sending them to the login screen.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let res = await rawRequest(path, options);

  if (
    res.status === 401 &&
    path !== "/auth/login" &&
    path !== "/auth/refresh"
  ) {
    const refreshed = await attemptRefresh();

    if (refreshed) {
      res = await rawRequest(path, options);
    }
  }

  if (!res.ok) {
    let body: { error?: string; details?: unknown } = {};

    try {
      body = await res.json();
    } catch {
      // Non-JSON error body (e.g. a proxy/network error page) — fall
      // through to the generic message below.
    }

    throw new ApiError(
      body.error ?? "Ocorreu um erro inesperado. Tente novamente.",
      res.status,
      body.details,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
