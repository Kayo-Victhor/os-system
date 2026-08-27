import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as authApi from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import type { AuthUser } from "../api/types.ts";
import { roleHasPermission, type Permission } from "../api/permissions.ts";

interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    let cancelled = false;

    authApi
      .fetchCurrentUser()
      .then(({ user }) => {
        if (!cancelled) {
          setUser(user);
          setStatus("authenticated");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setStatus("unauthenticated");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await authApi.login(email, password);
    setUser(user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the network call fails, clear local state so the UI
      // reflects "logged out" — the httpOnly cookies may still be present
      // server-side until they expire, but the SPA shouldn't get stuck.
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const can = useCallback(
    (permission: Permission) =>
      user ? roleHasPermission(user.role, permission) : false,
    [user],
  );

  const value = useMemo(
    () => ({ user, status, login, logout, can }),
    [user, status, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return ctx;
}

export { ApiError };
