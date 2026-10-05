import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as customerAuthApi from "../api/customer-auth.ts";
import { ApiError } from "../api/client.ts";
import type { CustomerAccountProfile } from "../api/types.ts";
import {
  CustomerAuthContext,
  type CustomerAuthContextValue,
} from "./CustomerAuthContext.tsx";

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customerAccount, setCustomerAccount] =
    useState<CustomerAccountProfile | null>(null);
  const [status, setStatus] =
    useState<CustomerAuthContextValue["status"]>("loading");
  const sessionRequestRef = useRef<Promise<CustomerAccountProfile> | null>(null);

  const restoreSession = useCallback(() => {
    setStatus("loading");
    setCustomerAccount(null);
    const request = customerAuthApi
      .fetchCurrentCustomerAccount()
      .then(({ customerAccount: current }) => current);
    sessionRequestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    let active = true;
    const request = sessionRequestRef.current ?? restoreSession();
    void request.then(
      (current) => {
        if (!active) return;
        setCustomerAccount(current);
        setStatus("authenticated");
      },
      (error: unknown) => {
        if (!active) return;
        setCustomerAccount(null);
        setStatus(
          error instanceof ApiError && error.status === 401
            ? "unauthenticated"
            : "error",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [restoreSession]);

  useEffect(() => {
    const expire = () => {
      setCustomerAccount(null);
      setStatus("unauthenticated");
    };
    window.addEventListener("os-system:customer-session-expired", expire);
    return () =>
      window.removeEventListener("os-system:customer-session-expired", expire);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { customerAccount: current } = await customerAuthApi.loginCustomer(
      email,
      password,
    );
    setCustomerAccount(current);
    setStatus("authenticated");
    return current;
  }, []);

  const logout = useCallback(async () => {
    try {
      await customerAuthApi.logoutCustomer();
    } catch {
      // Always leave the authenticated UI, even if the network is unavailable.
    } finally {
      setCustomerAccount(null);
      setStatus("unauthenticated");
    }
  }, []);

  const retrySession = useCallback(() => {
    sessionRequestRef.current = null;
    void restoreSession().then(
      (current) => {
        setCustomerAccount(current);
        setStatus("authenticated");
      },
      (error: unknown) => {
        setCustomerAccount(null);
        setStatus(
          error instanceof ApiError && error.status === 401
            ? "unauthenticated"
            : "error",
        );
      },
    );
  }, [restoreSession]);

  const value = useMemo(
    () => ({ customerAccount, status, login, logout, retrySession }),
    [customerAccount, status, login, logout, retrySession],
  );

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}
