import { createContext } from "react";

import type { AuthUser } from "../api/types.ts";
import type { Permission } from "../api/permissions.ts";

export interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  retrySession: () => void;
  can: (permission: Permission) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
