import { useCallback, useRef, useState } from "react";
import * as usersApi from "../api/users.ts";
import type { UserRecord, UserRole } from "../api/types.ts";
import { ROLE_LABELS } from "../api/types.ts";
import { useAuth } from "../hooks/useAuth.ts";
import {
  PageLoading,
  ErrorState,
  EmptyState,
  ErrorBanner,
  ConfirmDialog,
} from "../components/States.tsx";
import { RoleBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";
import { IconPlus } from "../components/icons.tsx";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { Button, ButtonLink } from "../components/Button.tsx";
import { DataTable } from "../components/DataTable.tsx";

// Matches the backend's internal User role enum exactly.
const EDITABLE_ROLES: UserRole[] = ["ADMIN", "ATTENDANT", "TECHNICIAN"];

export function UsersListPage() {
  const { can, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);

  const latestLoadRef = useRef(0);
  const load = useCallback(async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
    if (!isActive()) return;
    const requestId = ++latestLoadRef.current;
    const canCommit = () => isActive() && requestId === latestLoadRef.current;
    setError(null);
    try {
      const userList = await usersApi.listUsers(undefined, signal);
      if (canCommit()) setUsers(userList);
    } catch {
      if (canCommit()) setError("Não foi possível carregar os usuários.");
    }
  }, []);

  useInitialAsyncLoad(load);

  type EditableUserRole = "ADMIN" | "ATTENDANT" | "TECHNICIAN";

  async function handleRoleChange(id: string, role: EditableUserRole) {
    setActionError(null);
    setSavingId(id);

    try {
      const updated = await usersApi.updateUser(id, { role });
      setUsers((prev) => prev?.map((u) => (u.id === id ? updated : u)) ?? null);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível atualizar o papel do usuário.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSavingId(deleteTarget.id);
    setActionError(null);

    try {
      await usersApi.deleteUser(deleteTarget.id);
      setUsers((prev) => prev?.filter((u) => u.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível excluir o usuário.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="operational-page">
      <PageHeader
        title="Usuários"
        description="Gerencie contas de atendentes, técnicos e administradores."
        actions={can("USER_CREATE") ? (
          <ButtonLink to="/users/new">
            <IconPlus width={16} height={16} />
            Novo usuário
          </ButtonLink>
        ) : undefined}
      />

      {actionError && <ErrorBanner message={actionError} />}

      {users === null && !error && <PageLoading label="Carregando usuários..." />}
      {error && <ErrorState message={error} onRetry={load} />}

      {users && users.length === 0 && (
        <EmptyState title="Nenhum usuário cadastrado." />
      )}

      {users && users.length > 0 && (
        <DataTable label="Usuários cadastrados">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const isPrimaryAdmin = u.isPrimaryAdmin;
                const canEditRole = can("USER_UPDATE") && !isSelf && !isPrimaryAdmin;
                const canDeleteUser = can("USER_DELETE") && !isSelf && !isPrimaryAdmin;
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {!canEditRole ? (
                        <div className="user-role-summary">
                          <RoleBadge role={u.role} />
                          {isPrimaryAdmin && <span className="field-hint">Administrador principal</span>}
                        </div>
                      ) : (
                        <select
                          className="input user-role-select"
                          value={u.role}
                          disabled={savingId === u.id}
                          aria-busy={savingId === u.id || undefined}
                          onChange={(e) =>
                            handleRoleChange(
                              u.id,
                              e.target.value as EditableUserRole,
                            )
                          }
                          aria-label={`Alterar papel de ${u.name}`}
                        >
                          {EDITABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td>
                      {!canDeleteUser ? (
                        <span className="field-hint">
                          {isPrimaryAdmin
                            ? "Administrador principal"
                            : isSelf ? "Sua conta" : "Sem ações disponíveis"}
                        </span>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteTarget(u)}
                          disabled={savingId === u.id}
                        >
                          Excluir
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
        </DataTable>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir usuário"
        description={`Tem certeza que deseja excluir "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        busy={savingId === deleteTarget?.id}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
