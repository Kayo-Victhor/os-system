import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";

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

// Matches the backend's updateUserSchema role enum exactly — CUSTOMER is
// deliberately excluded: converting a self-registered customer account to
// staff (or vice versa) isn't a supported operation on this endpoint, so
// it isn't offered as a choice (see PATCH /users/:id in
// schemas/user.schema.ts).
const EDITABLE_ROLES: UserRole[] = ["ADMIN", "ATTENDANT", "TECHNICIAN"];

export function UsersListPage() {
  const { user: currentUser } = useAuth();
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

  if (users === null && !error) return <PageLoading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Usuários</h1>
          <p className="page-subtitle">
            Gerencie contas de atendentes, técnicos e administradores.
          </p>
        </div>
        <Link to="/users/new" className="btn btn-primary">
          <IconPlus width={16} height={16} />
          Novo usuário
        </Link>
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      {users && users.length === 0 && (
        <EmptyState title="Nenhum usuário cadastrado." />
      )}

      {users && users.length > 0 && (
        <div className="card table-wrap">
          <table className="data-table">
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
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {isSelf || isPrimaryAdmin || u.role === "CUSTOMER" ? (
                        <>
                          <RoleBadge role={u.role} />
                          {isPrimaryAdmin && <span className="field-hint">Administrador principal</span>}
                        </>
                      ) : (
                        <select
                          className="input"
                          style={{
                            width: "auto",
                            padding: "4px 8px",
                            fontSize: 12.5,
                          }}
                          value={u.role}
                          disabled={savingId === u.id}
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
                      {isSelf || isPrimaryAdmin ? (
                        <span className="field-hint">{isPrimaryAdmin ? "Administrador principal" : "Sua conta"}</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeleteTarget(u)}
                          disabled={savingId === u.id}
                        >
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
