import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import * as serviceOrdersApi from "../api/service-orders.ts";
import * as usersApi from "../api/users.ts";
import type { ServiceOrder, ServiceOrderPriority, ServiceOrderStatus, UserRecord } from "../api/types.ts";
import {
  SERVICE_ORDER_STATUSES,
  SERVICE_ORDER_PRIORITIES,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "../api/types.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { PageLoading, ErrorState, ErrorBanner, SuccessBanner, ConfirmDialog } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";
import { IconArrowLeft } from "../components/icons.tsx";

export function ServiceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, can } = useAuth();

  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [technicians, setTechnicians] = useState<UserRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<ServiceOrderPriority>("MEDIUM");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);

    try {
      const data = await serviceOrdersApi.getServiceOrder(id);
      setOrder(data);
      setEditTitle(data.title);
      setEditDescription(data.description);
      setEditPriority(data.priority);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? "Ordem de serviço não encontrada."
          : "Não foi possível carregar a ordem de serviço.",
      );
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!can("OS_ASSIGN")) return;

    usersApi
      .listUsers("TECHNICIAN")
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
  }, [can]);

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!order) return <PageLoading label="Carregando ordem de serviço..." />;

  const canUpdateStatus =
    can("OS_UPDATE_STATUS") && (user?.role === "ADMIN" || order.technicianId === user?.id);

  async function handleStatusChange(status: ServiceOrderStatus) {
    if (!order) return;
    setActionError(null);
    setSavingField("status");

    try {
      const updated = await serviceOrdersApi.updateServiceOrderStatus(order.id, status);
      setOrder(updated);
      setSuccessMessage("Status atualizado.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível atualizar o status.");
    } finally {
      setSavingField(null);
    }
  }

  async function handleAssign(technicianId: string) {
    if (!order) return;
    setActionError(null);
    setSavingField("technician");

    try {
      const updated = await serviceOrdersApi.assignTechnician(order.id, technicianId || null);
      setOrder(updated);
      setSuccessMessage("Técnico atualizado.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível atribuir o técnico.");
    } finally {
      setSavingField(null);
    }
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    setActionError(null);
    setSavingField("edit");

    try {
      const updated = await serviceOrdersApi.updateServiceOrder(order.id, {
        title: editTitle,
        description: editDescription,
        priority: editPriority,
      });
      setOrder(updated);
      setEditing(false);
      setSuccessMessage("Ordem atualizada.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível salvar as alterações.");
    } finally {
      setSavingField(null);
    }
  }

  async function handleDelete() {
    if (!order) return;
    setSavingField("delete");

    try {
      await serviceOrdersApi.deleteServiceOrder(order.id);
      navigate("/service-orders", { replace: true });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível excluir a ordem.");
      setDeleteOpen(false);
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/service-orders")}>
        <IconArrowLeft width={16} height={16} />
        Voltar para ordens
      </button>

      <div className="page-header" style={{ marginTop: 8 }}>
        <div>
          <h1>{order.title}</h1>
          <p className="page-subtitle">
            Criada por {order.createdBy.name} em {new Date(order.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <StatusBadge status={order.status} />
          <PriorityBadge priority={order.priority} />
        </div>
      </div>

      {actionError && <ErrorBanner message={actionError} />}
      {successMessage && <SuccessBanner message={successMessage} />}

      <div className="detail-grid">
        <div>
          <div className="card detail-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Detalhes</h2>
              {can("OS_UPDATE") && !editing && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  Editar
                </button>
              )}
            </div>

            {!editing ? (
              <p style={{ whiteSpace: "pre-wrap" }}>{order.description}</p>
            ) : (
              <form onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="field">
                  <label htmlFor="edit-title">Título</label>
                  <input
                    id="edit-title"
                    className="input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-description">Descrição</label>
                  <textarea
                    id="edit-description"
                    className="input"
                    rows={4}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-priority">Prioridade</label>
                  <select
                    id="edit-priority"
                    className="input"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as ServiceOrderPriority)}
                  >
                    {SERVICE_ORDER_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={savingField === "edit"}>
                    {savingField === "edit" ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setEditing(false);
                      setEditTitle(order.title);
                      setEditDescription(order.description);
                      setEditPriority(order.priority);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>

          {can("OS_DELETE") && (
            <div className="card detail-section">
              <h2>Zona de risco</h2>
              <p className="page-subtitle" style={{ marginBottom: 12 }}>
                Excluir uma ordem de serviço é permanente e não pode ser desfeito.
              </p>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>
                Excluir ordem de serviço
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="card detail-section">
            <h2>Cliente</h2>
            <dl className="kv-list">
              <div className="kv-row">
                <dt>Nome</dt>
                <dd>
                  <Link to={`/customers/${order.customer.id}`}>{order.customer.name}</Link>
                </dd>
              </div>
              {order.customer.phone && (
                <div className="kv-row">
                  <dt>Telefone</dt>
                  <dd>{order.customer.phone}</dd>
                </div>
              )}
              {order.customer.email && (
                <div className="kv-row">
                  <dt>E-mail</dt>
                  <dd>{order.customer.email}</dd>
                </div>
              )}
            </dl>
          </div>

          {canUpdateStatus && (
            <div className="card detail-section">
              <h2>Status</h2>
              <div className="field">
                <label htmlFor="status-select">Alterar status</label>
                <select
                  id="status-select"
                  className="input"
                  value={order.status}
                  disabled={savingField === "status"}
                  onChange={(e) => handleStatusChange(e.target.value as ServiceOrderStatus)}
                >
                  {SERVICE_ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {can("OS_ASSIGN") && (
            <div className="card detail-section">
              <h2>Técnico responsável</h2>
              <div className="field">
                <label htmlFor="technician-select">Atribuir técnico</label>
                <select
                  id="technician-select"
                  className="input"
                  value={order.technicianId ?? ""}
                  disabled={savingField === "technician"}
                  onChange={(e) => handleAssign(e.target.value)}
                >
                  <option value="">Não atribuído</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {!can("OS_ASSIGN") && (
            <div className="card detail-section">
              <h2>Técnico responsável</h2>
              <p>{order.technician?.name ?? "Não atribuído"}</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Excluir ordem de serviço"
        description={`Tem certeza que deseja excluir "${order.title}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        busy={savingField === "delete"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
