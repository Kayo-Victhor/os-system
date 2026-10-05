import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.ts";
import { useCustomerAuth } from "../hooks/useCustomerAuth.ts";
import { EmptyState, SessionRestoreError, SessionRestoringShell } from "./States.tsx";
import type { Permission } from "../api/permissions.ts";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, retrySession } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <SessionRestoringShell />;
  }

  if (status === "error") {
    return (
      <SessionRestoreError
        onRetry={retrySession}
        loginAction={<Link className="btn btn-secondary" to="/login">Ir para login</Link>}
      />
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = useAuth();

  if (!can(permission)) {
    return (
      <EmptyState
        title="Acesso não permitido"
        description="Você não tem permissão para acessar esta página."
      />
    );
  }

  return <>{children}</>;
}

export function RequireCustomerAuth({ children }: { children: ReactNode }) {
  const { status, retrySession } = useCustomerAuth();
  const location = useLocation();

  if (status === "loading") return <SessionRestoringShell />;
  if (status === "error") {
    return (
      <SessionRestoreError
        onRetry={retrySession}
        loginAction={
          <Link className="btn btn-secondary" to="/customer/login">
            Ir para login do cliente
          </Link>
        }
      />
    );
  }
  if (status === "unauthenticated") {
    return (
      <Navigate
        to="/customer/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  return <>{children}</>;
}
