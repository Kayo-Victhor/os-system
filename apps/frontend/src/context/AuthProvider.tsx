import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import * as authApi from "../api/auth.ts";
import { roleHasPermission, type Permission } from "../api/permissions.ts";
import type { AuthUser } from "../api/types.ts";
import { AuthContext, type AuthContextValue } from "./AuthContext.tsx";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    let cancelled = false;
    void authApi.fetchCurrentUser().then(({ user: currentUser }) => {
      if (!cancelled) { setUser(currentUser); setStatus("authenticated"); }
    }).catch(() => {
      if (!cancelled) { setUser(null); setStatus("unauthenticated"); }
    });
    return () => { cancelled = true; };
  }, []);

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
  const can = useCallback((permission: Permission) => user ? roleHasPermission(user.role, permission) : false, [user]);
  const value = useMemo(() => ({ user, status, login, logout, can }), [user, status, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
