import { createContext, useContext } from "react";

import type { AuthUser } from "../api/types.ts";
import type { Permission } from "../api/permissions.ts";

export interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
