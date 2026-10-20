import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import * as serviceOrdersApi from "../api/service-orders.ts";
import type { ServiceOrder, ServiceOrderEvent, ServiceOrderPriority, ServiceOrderStatus, ServiceOrderTechnician } from "../api/types.ts";
import {
  SERVICE_ORDER_PRIORITIES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  allowedStatusTransitions,
} from "../api/types.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { PageLoading, ErrorState, ErrorBanner, SuccessBanner, ConfirmDialog } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";
import { IconArrowLeft } from "../components/icons.tsx";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";
import { InternalServiceOrderTimeline } from "../components/ServiceOrderTimeline.tsx";
import { ServiceOrderNotes } from "../components/ServiceOrderNotes.tsx";
import { Button } from "../components/Button.tsx";
import { Field } from "../components/Field.tsx";
import { Surface } from "../components/Surface.tsx";
import { PageHeader, PageSection } from "../components/PageHeader.tsx";
import { InternalForm, FormActions } from "../components/InternalForm.tsx";
import { fieldErrorsFromDetails } from "../api/errors.ts";

export function ServiceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, can } = useAuth();

  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [technicians, setTechnicians] = useState<ServiceOrderTechnician[]>([]);
  const [timeline, setTimeline] = useState<ServiceOrderEvent[] | null>(null);
  const [timelineError, setTimelineError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<ServiceOrderPriority>("MEDIUM");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const latestLoadRef = useRef(0);
  const load = useCallback(async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
    if (!id || !isActive()) return;
    const requestId = ++latestLoadRef.current;
    const canCommit = () => isActive() && requestId === latestLoadRef.current;
    setLoadError(null);
    try {
      const data = await serviceOrdersApi.getServiceOrder(id, signal);
      if (!canCommit()) return;
      setOrder(data);
      setEditTitle(data.title);
      setEditDescription(data.description);
      setEditPriority(data.priority);
      try {
        setTimeline(await serviceOrdersApi.listServiceOrderEvents(id, signal));
        setTimelineError(false);
      } catch {
        if (canCommit()) setTimelineError(true);
      }
    } catch (err) {
      if (canCommit()) setLoadError(err instanceof ApiError && err.status === 404 ? "Ordem de serviço não encontrada." : "Não foi possível carregar a ordem de serviço.");
    }
  }, [id]);

  useInitialAsyncLoad(load);

  const refreshTimeline = useCallback(async () => {
    if (!id) return;
    try {
      setTimeline(await serviceOrdersApi.listServiceOrderEvents(id));
      setTimelineError(false);
    } catch {
      setTimelineError(true);
    }
  }, [id]);

  useEffect(() => {
    if (!can("OS_ASSIGN")) return;
    const controller = new AbortController();
    void serviceOrdersApi.listAssignableTechnicians(controller.signal)
      .then((items) => { if (!controller.signal.aborted) setTechnicians(items); })
      .catch(() => { if (!controller.signal.aborted) setTechnicians([]); });
    return () => controller.abort();
  }, [can]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />;
  if (!order) return <PageLoading label="Carregando ordem de serviço..." />;

  const nextStatuses = user
    ? allowedStatusTransitions(order.status, user.role)
    : [];
  const canUpdateStatus =
    can("OS_UPDATE_STATUS") &&
    (user?.role === "ADMIN" || order.technicianId === user?.id) &&
    nextStatuses.length > 0;

  async function handleStatusChange(status: ServiceOrderStatus) {
    if (!order || savingField) return;
    setActionError(null);
    setSavingField("status");

    try {
      const updated = await serviceOrdersApi.updateServiceOrderStatus(order.id, status);
      setOrder(updated);
      await refreshTimeline();
      setSuccessMessage("Status atualizado.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível atualizar o status.");
    } finally {
      setSavingField(null);
    }
  }

  async function handleAssign(technicianId: string) {
    if (!order || savingField) return;
    setActionError(null);
    setSavingField("technician");

    try {
      const updated = await serviceOrdersApi.assignTechnician(order.id, technicianId || null);
      setOrder(updated);
      await refreshTimeline();
      setSuccessMessage("Técnico atualizado.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível atribuir o técnico.");
    } finally {
      setSavingField(null);
    }
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!order || savingField) return;
    setActionError(null);
    setEditErrors({});
    setSavingField("edit");

    try {
      const updated = await serviceOrdersApi.updateServiceOrder(order.id, {
        title: editTitle,
        description: editDescription,
        priority: editPriority,
      });
      setOrder(updated);
      await refreshTimeline();
      setEditing(false);
      setSuccessMessage("Ordem atualizada.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setEditErrors(fieldErrorsFromDetails(err.details));
      }
      setActionError(err instanceof ApiError ? err.message : "Não foi possível salvar as alterações.");
    } finally {
      setSavingField(null);
    }
  }

  async function handleDelete() {
    if (!order || savingField) return;
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
    <div className="internal-page">
      <Button variant="neutral" size="sm" className="internal-page__back" onClick={() => navigate("/service-orders")}>
        <IconArrowLeft width={16} height={16} />
        Voltar para ordens
      </Button>
      <Surface padded={false} className="internal-order-workspace">
        <div className="internal-order-heading">
          <PageHeader
            title={order.title}
            description={`Ordem #${order.id.slice(-6).toUpperCase()} · Criada por ${order.createdBy.name} em ${new Date(order.createdAt).toLocaleDateString("pt-BR")}`}
            actions={can("OS_UPDATE") && !editing ? (
              <Button variant="primary" size="sm" disabled={Boolean(savingField)} onClick={() => { setEditErrors({}); setEditing(true); }}>Editar</Button>
            ) : undefined}
          />
          <div className="internal-page__badges">
            <StatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} />
          </div>
        </div>

        {(actionError || successMessage) && <div className="internal-order-feedback">
          {actionError && <ErrorBanner message={actionError} />}
          {successMessage && <SuccessBanner message={successMessage} />}
        </div>}

        <div className="internal-detail-grid internal-order-grid">
          <section className="internal-order-description">
            <PageSection title={editing ? "Editar ordem de serviço" : "Descrição do problema"}>

              {!editing ? (
                <p className="internal-description">{order.description}</p>
              ) : (
                <InternalForm onSubmit={handleSaveEdit} noValidate busy={savingField === "edit"} errors={editErrors}>
                  <Field label="Título" required error={editErrors.title}>
                    {(props) => (
                      <input
                        {...props}
                        className="input"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Descrição" required error={editErrors.description}>
                    {(props) => (
                      <textarea
                        {...props}
                        className="input"
                        rows={4}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Prioridade" required error={editErrors.priority}>
                    {(props) => (
                      <select
                        {...props}
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
                    )}
                  </Field>
                  <FormActions busy={savingField === "edit"} label="Salvar" onCancel={() => {
                    setEditing(false);
                    setEditErrors({});
                    setActionError(null);
                    setEditTitle(order.title);
                    setEditDescription(order.description);
                    setEditPriority(order.priority);
                  }} />
                </InternalForm>
              )}
            </PageSection>
          </section>
          <aside className="internal-order-context" aria-label="Informações e acompanhamento da ordem">
            <div className="internal-order-context__section">
              <PageSection title="Cliente">
                <dl className="internal-facts internal-facts--single">
                  <div>
                    <dt>Nome</dt>
                    <dd>
                      <Link to={`/customers/${order.customer.id}`}>{order.customer.name}</Link>
                    </dd>
                  </div>
                  {order.customer.phone && (
                    <div>
                      <dt>Telefone</dt>
                      <dd>{order.customer.phone}</dd>
                    </div>
                  )}
                  {order.customer.email && (
                    <div>
                      <dt>E-mail</dt>
                      <dd>{order.customer.email}</dd>
                    </div>
                  )}
                </dl>
              </PageSection>
            </div>

            <div className="internal-order-context__section">
              <PageSection title="Acompanhamento">
                {canUpdateStatus && (
                  <div>
                    <div className="field">
                      <label htmlFor="status-select">Alterar status</label>
                      <select
                        id="status-select"
                        className="input"
                        value={order.status}
                        disabled={Boolean(savingField)}
                        aria-busy={savingField === "status" || undefined}
                        onChange={(e) => handleStatusChange(e.target.value as ServiceOrderStatus)}
                      >
                        {[order.status, ...nextStatuses].map((s) => (
                          <option key={s} value={s}>
                            {s === order.status
                              ? `${STATUS_LABELS[s]} (atual)`
                              : STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {!canUpdateStatus && (
                  <dl className="internal-facts internal-facts--single">
                    <div><dt>Status</dt><dd>{STATUS_LABELS[order.status]} (atual)</dd></div>
                  </dl>
                )}

                {can("OS_ASSIGN") && (
                  <div className="internal-page__actions">
                    <div className="field">
                      <label htmlFor="technician-select">Atribuir técnico</label>
                      <select
                        id="technician-select"
                        className="input"
                        value={order.technicianId ?? ""}
                        disabled={Boolean(savingField)}
                        aria-busy={savingField === "technician" || undefined}
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
                  <dl className="internal-facts internal-facts--single internal-page__actions">
                    <div><dt>Técnico responsável</dt><dd>{order.technician?.name ?? "Não atribuído"}</dd></div>
                  </dl>
                )}
                <dl className="internal-facts internal-facts--single internal-order-context__facts">
                  <div><dt>Prioridade</dt><dd>{PRIORITY_LABELS[order.priority]} (atual)</dd></div>
                  <div><dt>Última atualização</dt><dd>{new Date(order.updatedAt).toLocaleString("pt-BR")}</dd></div>
                </dl>
              </PageSection>
            </div>
          </aside>
          <section className="internal-order-history">
            <PageSection title="Histórico operacional" description="Eventos registrados automaticamente durante o atendimento.">
              {timelineError ? (
                <ErrorState message="Não foi possível atualizar o histórico." onRetry={() => void refreshTimeline()} />
              ) : timeline === null ? (
                <PageLoading label="Carregando histórico..." />
              ) : <InternalServiceOrderTimeline events={timeline} />}
            </PageSection>
          </section>
          {can("OS_NOTE_READ") && <ServiceOrderNotes serviceOrderId={order.id} canCreate={can("OS_NOTE_CREATE")} />}
        </div>
      </Surface>

      {can("OS_DELETE") && (
        <Surface className="internal-panel internal-danger">
          <PageSection title="Zona de risco">
            <p>Excluir uma ordem de serviço é permanente e não pode ser desfeito.</p>
            <div className="internal-page__actions">
              <Button variant="danger" size="sm" disabled={Boolean(savingField)} onClick={() => setDeleteOpen(true)}>Excluir ordem de serviço</Button>
            </div>
          </PageSection>
        </Surface>
      )}

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
