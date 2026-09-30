import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import * as authApi from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { roleHasPermission, type Permission } from "../api/permissions.ts";
import type { AuthUser } from "../api/types.ts";
import { AuthContext, type AuthContextValue } from "./AuthContext.tsx";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const sessionRequestRef = useRef<Promise<AuthUser> | null>(null);

  const restoreSession = useCallback(() => {
    setStatus("loading");
    setUser(null);
    const request = authApi.fetchCurrentUser().then(({ user: currentUser }) => currentUser);
    sessionRequestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    let active = true;
    // StrictMode re-executes effects in development. Reusing this promise
    // keeps bootstrap to one /auth/me request.
    const request = sessionRequestRef.current ?? restoreSession();

    void request.then(
      (currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setStatus("authenticated");
      },
      (error: unknown) => {
        if (!active) return;
        setUser(null);
        setStatus(error instanceof ApiError && error.status === 401 ? "unauthenticated" : "error");
      },
    );

    return () => { active = false; };
  }, [restoreSession]);

  useEffect(() => {
    const handleExpiredSession = () => { setUser(null); setStatus("unauthenticated"); };
    window.addEventListener("os-system:session-expired", handleExpiredSession);
    return () => window.removeEventListener("os-system:session-expired", handleExpiredSession);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: authenticatedUser } = await authApi.login(email, password);
    setUser(authenticatedUser); setStatus("authenticated");
    return authenticatedUser;
  }, []);
  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch {
      // The client must leave its authenticated UI state even on a network failure.
    } finally { setUser(null); setStatus("unauthenticated"); }
  }, []);
  const retrySession = useCallback(() => {
    void restoreSession().then(
      (currentUser) => {
        setUser(currentUser);
        setStatus("authenticated");
      },
      (error: unknown) => {
        setUser(null);
        setStatus(error instanceof ApiError && error.status === 401 ? "unauthenticated" : "error");
      },
    );
  }, [restoreSession]);
  const can = useCallback((permission: Permission) => user ? roleHasPermission(user.role, permission) : false, [user]);
  const value = useMemo(() => ({ user, status, login, logout, retrySession, can }), [user, status, login, logout, retrySession, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
