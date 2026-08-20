import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext.tsx";
import { PageLoading } from "./States.tsx";
import type { Permission } from "../api/permissions.ts";
import { EmptyState } from "./States.tsx";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <PageLoading label="Verificando sessão..." />;
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
