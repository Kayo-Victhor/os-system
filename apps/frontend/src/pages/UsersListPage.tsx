import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import * as usersApi from "../api/users.ts";
import type { UserRecord, UserRole } from "../api/types.ts";
import { ROLE_LABELS } from "../api/types.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { PageLoading, ErrorState, EmptyState, ErrorBanner, ConfirmDialog } from "../components/States.tsx";
import { RoleBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";
import { IconPlus } from "../components/icons.tsx";

export function UsersListPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);

  async function load() {
    setError(null);

    try {
      setUsers(await usersApi.listUsers());
    } catch {
      setError("Não foi possível carregar os usuários.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRoleChange(id: string, role: UserRole) {
    setActionError(null);
    setSavingId(id);

    try {
      const updated = await usersApi.updateUser(id, { role });
      setUsers((prev) => prev?.map((u) => (u.id === id ? updated : u)) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível atualizar o papel do usuário.");
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
      setActionError(err instanceof ApiError ? err.message : "Não foi possível excluir o usuário.");
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
          <p className="page-subtitle">Gerencie contas de atendentes, técnicos e administradores.</p>
        </div>
        <Link to="/users/new" className="btn btn-primary">
          <IconPlus width={16} height={16} />
          Novo usuário
        </Link>
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      {users && users.length === 0 && <EmptyState title="Nenhum usuário cadastrado." />}

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
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {isSelf ? (
                        <RoleBadge role={u.role} />
                      ) : (
                        <select
                          className="input"
                          style={{ width: "auto", padding: "4px 8px", fontSize: 12.5 }}
                          value={u.role}
                          disabled={savingId === u.id}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          aria-label={`Alterar papel de ${u.name}`}
                        >
                          {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td>
                      {isSelf ? (
                        <span className="field-hint">Sua conta</span>
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
