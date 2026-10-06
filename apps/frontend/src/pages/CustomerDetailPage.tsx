import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import * as customersApi from "../api/customers.ts";
import * as serviceOrdersApi from "../api/service-orders.ts";
import type { Customer, ServiceOrder } from "../api/types.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { PageLoading, ErrorState, ErrorBanner, SuccessBanner, ConfirmDialog, EmptyState } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";
import { fieldErrorsFromDetails } from "../api/errors.ts";
import { CustomerForm } from "./CustomerForm.tsx";
import { IconArrowLeft } from "../components/icons.tsx";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";

type LifecycleAction =
  | "SUSPEND"
  | "REACTIVATE"
  | "DELETE_ACCOUNT"
  | "ANONYMIZE";

const lifecycleDialog: Record<
  LifecycleAction,
  { title: string; description: string; confirmLabel: string; danger?: boolean }
> = {
  SUSPEND: {
    title: "Suspender conta",
    description:
      "A conta deixará de acessar o portal e todas as sessões serão encerradas. O cliente e suas ordens serão preservados.",
    confirmLabel: "Suspender conta",
  },
  REACTIVATE: {
    title: "Reativar conta",
    description:
      "A conta poderá fazer um novo login. Sessões encerradas anteriormente não serão restauradas.",
    confirmLabel: "Reativar conta",
  },
  DELETE_ACCOUNT: {
    title: "Excluir conta de acesso",
    description:
      "As credenciais e sessões serão removidas, mas o cadastro do cliente e todo o histórico de ordens serão preservados.",
    confirmLabel: "Excluir conta",
    danger: true,
  },
  ANONYMIZE: {
    title: "Anonimizar cliente",
    description:
      "Nome, e-mail, telefone, documento e endereço serão substituídos ou removidos. A conta de acesso será excluída e as ordens serão preservadas. Esta ação não pode ser desfeita.",
    confirmLabel: "Anonimizar cliente",
    danger: true,
  },
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lifecycleAction, setLifecycleAction] =
    useState<LifecycleAction | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  const [orderHistoryError, setOrderHistoryError] = useState<string | null>(null);

  const latestLoadRef = useRef(0);
  const load = useCallback(async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
    if (!id || !isActive()) return;
    const requestId = ++latestLoadRef.current;
    const canCommit = () => isActive() && requestId === latestLoadRef.current;
    setLoadError(null);
    setOrderHistoryError(null);

    const [customerResult, ordersResult] = await Promise.allSettled([
      customersApi.getCustomer(id, signal),
      can("OS_READ")
        ? serviceOrdersApi.listServiceOrders({ customerId: id }, signal)
        : Promise.resolve([] as ServiceOrder[]),
    ]);

    if (!canCommit()) return;
    if (customerResult.status === "rejected") {
      setLoadError(customerResult.reason instanceof ApiError && customerResult.reason.status === 404 ? "Cliente não encontrado." : "Não foi possível carregar o cliente.");
      return;
    }

    setCustomer(customerResult.value);
    if (!can("OS_READ")) return;
    if (ordersResult.status === "fulfilled") {
      setOrders(ordersResult.value);
    } else {
      setOrderHistoryError(ordersResult.reason instanceof ApiError ? ordersResult.reason.message : "Não foi possível carregar o histórico de ordens.");
    }
  }, [id, can]);

  useInitialAsyncLoad(load);

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!customer) return <PageLoading label="Carregando cliente..." />;

  async function handleSave(data: customersApi.CustomerInput) {
    if (!customer) return;
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      const updated = await customersApi.updateCustomer(customer.id, data);
      setCustomer(updated);
      setEditing(false);
      setSuccessMessage("Cliente atualizado.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(fieldErrorsFromDetails(err.details));
        setFormError("Verifique os campos destacados.");
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Não foi possível salvar as alterações.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!customer) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await customersApi.deleteCustomer(customer.id);
      navigate("/customers", { replace: true });
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível excluir o cliente.",
      );
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleLifecycleAction() {
    if (!customer || !lifecycleAction) return;
    setLifecycleBusy(true);
    setDeleteError(null);

    try {
      if (lifecycleAction === "SUSPEND" || lifecycleAction === "REACTIVATE") {
        const status = lifecycleAction === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
        const result = await customersApi.updateCustomerAccountStatus(
          customer.id,
          status,
        );
        setCustomer({ ...customer, customerAccount: result.customerAccount });
        setSuccessMessage(
          status === "SUSPENDED"
            ? "Conta de acesso suspensa e sessões encerradas."
            : "Conta de acesso reativada. Um novo login já pode ser realizado.",
        );
      } else if (lifecycleAction === "DELETE_ACCOUNT") {
        await customersApi.deleteCustomerAccount(customer.id);
        setCustomer({ ...customer, customerAccount: null });
        setSuccessMessage(
          "Conta de acesso excluída. O cliente e o histórico foram preservados.",
        );
      } else {
        const anonymized = await customersApi.anonymizeCustomer(customer.id);
        setCustomer(anonymized);
        setEditing(false);
        setSuccessMessage(
          "Cliente anonimizado. A conta de acesso foi removida e o histórico foi preservado.",
        );
      }
      setLifecycleAction(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível concluir a operação.",
      );
      setLifecycleAction(null);
    } finally {
      setLifecycleBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/customers")}>
        <IconArrowLeft width={16} height={16} />
        Voltar para clientes
      </button>

      <div className="page-header" style={{ marginTop: 8 }}>
        <h1>{customer.name}</h1>
        {can("CUSTOMER_UPDATE") && !editing && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
      </div>

      {deleteError && <ErrorBanner message={deleteError} />}
      {successMessage && !editing && <SuccessBanner message={successMessage} />}

      <div className="detail-grid">
        <div>
          <div className="card detail-section">
            <h2>{editing ? "Editar informações" : "Informações"}</h2>

            {editing ? (
              <>
                {formError && <ErrorBanner message={formError} />}
                <CustomerForm
                  initial={{
                    name: customer.name,
                    email: customer.email ?? undefined,
                    phone: customer.phone ?? undefined,
                    document: customer.document ?? undefined,
                    address: customer.address ?? undefined,
                  }}
                  fieldErrors={fieldErrors}
                  submitting={submitting}
                  submitLabel="Salvar alterações"
                  onSubmit={handleSave}
                  onCancel={() => setEditing(false)}
                />
              </>
            ) : (
              <dl className="kv-list">
                <div className="kv-row">
                  <dt>E-mail</dt>
                  <dd>{customer.email ?? "—"}</dd>
                </div>
                <div className="kv-row">
                  <dt>Telefone</dt>
                  <dd>{customer.phone ?? "—"}</dd>
                </div>
                <div className="kv-row">
                  <dt>Documento</dt>
                  <dd>{customer.document ?? "—"}</dd>
                </div>
                <div className="kv-row">
                  <dt>Endereço</dt>
                  <dd>{customer.address ?? "—"}</dd>
                </div>
                <div className="kv-row">
                  <dt>Cliente desde</dt>
                  <dd>{new Date(customer.createdAt).toLocaleDateString("pt-BR")}</dd>
                </div>
              </dl>
            )}
          </div>

          <div className="card detail-section">
            <h2>Conta de acesso</h2>
            <dl className="kv-list">
              <div className="kv-row">
                <dt>Situação</dt>
                <dd>
                  {customer.customerAccount?.status === "ACTIVE"
                    ? "Ativa"
                    : customer.customerAccount?.status === "SUSPENDED"
                      ? "Suspensa"
                      : "Sem conta de acesso"}
                </dd>
              </div>
            </dl>

            {can("CUSTOMER_ACCOUNT_MANAGE") && customer.customerAccount && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setLifecycleAction(
                      customer.customerAccount?.status === "ACTIVE"
                        ? "SUSPEND"
                        : "REACTIVATE",
                    )
                  }
                >
                  {customer.customerAccount.status === "ACTIVE"
                    ? "Suspender conta"
                    : "Reativar conta"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setLifecycleAction("DELETE_ACCOUNT")}
                >
                  Excluir conta de acesso
                </button>
              </div>
            )}
          </div>

          {(can("CUSTOMER_DELETE") || can("CUSTOMER_ANONYMIZE")) && !editing && (
            <div className="card detail-section">
              <h2>Zona de risco</h2>
              <p className="page-subtitle" style={{ marginBottom: 12 }}>
                A exclusão física só é permitida quando não há histórico de ordens.
                Para preservar o histórico, use a anonimização.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {can("CUSTOMER_ANONYMIZE") && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setLifecycleAction("ANONYMIZE")}
                  >
                    Anonimizar cliente
                  </button>
                )}
                {can("CUSTOMER_DELETE") && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>
                    Excluir cliente sem histórico
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {can("OS_READ") && (
          <div className="card detail-section">
            <h2>Histórico de ordens de serviço</h2>
            {orderHistoryError ? (
              <ErrorBanner message={orderHistoryError} />
            ) : orders.length === 0 ? (
              <EmptyState title="Nenhuma ordem de serviço para este cliente." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    to={`/service-orders/${order.id}`}
                    style={{ display: "block", color: "inherit" }}
                  >
                    <div className="card" style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{order.title}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <StatusBadge status={order.status} />
                        <PriorityBadge priority={order.priority} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Excluir cliente"
        description={`Tem certeza que deseja excluir "${customer.name}"? A operação será recusada se houver ordens de serviço vinculadas.`}
        confirmLabel="Excluir"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={lifecycleAction !== null}
        title={lifecycleAction ? lifecycleDialog[lifecycleAction].title : "Confirmar operação"}
        description={lifecycleAction ? lifecycleDialog[lifecycleAction].description : ""}
        confirmLabel={lifecycleAction ? lifecycleDialog[lifecycleAction].confirmLabel : "Confirmar"}
        danger={lifecycleAction ? lifecycleDialog[lifecycleAction].danger : false}
        busy={lifecycleBusy}
        onConfirm={handleLifecycleAction}
        onCancel={() => setLifecycleAction(null)}
      />
    </div>
  );
}
