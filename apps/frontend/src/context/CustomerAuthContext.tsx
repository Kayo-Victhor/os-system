import { createContext } from "react";

import type { CustomerAccountProfile } from "../api/types.ts";

export interface CustomerAuthContextValue {
  customerAccount: CustomerAccountProfile | null;
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  login: (email: string, password: string) => Promise<CustomerAccountProfile>;
  logout: () => Promise<void>;
  retrySession: () => void;
}

export const CustomerAuthContext =
  createContext<CustomerAuthContextValue | null>(null);
