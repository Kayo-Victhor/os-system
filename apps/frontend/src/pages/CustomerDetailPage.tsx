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
import { Button } from "../components/Button.tsx";
import { PageHeader, PageSection } from "../components/PageHeader.tsx";
import { Surface } from "../components/Surface.tsx";
import { DataTable } from "../components/DataTable.tsx";

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
        ? serviceOrdersApi.listAllServiceOrders({ customerId: id }, signal)
        : Promise.resolve(null),
    ]);

    if (!canCommit()) return;
    if (customerResult.status === "rejected") {
      setLoadError(customerResult.reason instanceof ApiError && customerResult.reason.status === 404 ? "Cliente não encontrado." : "Não foi possível carregar o cliente.");
      return;
    }

    setCustomer(customerResult.value);
    if (!can("OS_READ")) return;
    if (ordersResult.status === "fulfilled") {
      if (ordersResult.value) setOrders(ordersResult.value);
    } else {
      setOrderHistoryError(ordersResult.reason instanceof ApiError ? ordersResult.reason.message : "Não foi possível carregar o histórico de ordens.");
    }
  }, [id, can]);

  useInitialAsyncLoad(load);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />;
  if (!customer) return <PageLoading label="Carregando cliente..." />;

  async function handleSave(data: customersApi.CustomerInput) {
    if (!customer || submitting) return;
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
    if (!customer || deleting) return;
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
    if (!customer || !lifecycleAction || lifecycleBusy) return;
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
    <div className="internal-page">
      <Button variant="neutral" size="sm" className="internal-page__back" onClick={() => navigate("/customers")}>
        <IconArrowLeft width={16} height={16} />
        Voltar para clientes
      </Button>

      <PageHeader title={customer.name} description={`Cliente desde ${new Date(customer.createdAt).toLocaleDateString("pt-BR")}`} actions={can("CUSTOMER_UPDATE") && !editing ? (
        <Button variant="secondary" size="sm" onClick={() => { setFormError(null); setFieldErrors({}); setEditing(true); }}>
          Editar
        </Button>
      ) : undefined} />

      {deleteError && <ErrorBanner message={deleteError} />}
      {successMessage && !editing && <SuccessBanner message={successMessage} />}

      <Surface className="internal-panel internal-customer-sheet">
        <PageSection title={editing ? "Editar informações" : "Informações"}>

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
            <dl className="internal-facts internal-customer-facts">
              <div>
                <dt>E-mail</dt>
                <dd>{customer.email ?? "—"}</dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>{customer.phone ?? "—"}</dd>
              </div>
              <div>
                <dt>Documento</dt>
                <dd>{customer.document ?? "—"}</dd>
              </div>
              <div className="internal-facts__wide">
                <dt>Endereço</dt>
                <dd>{customer.address ?? "—"}</dd>
              </div>
            </dl>
          )}
        </PageSection>

        <div className="internal-customer-access">
          <PageSection title="Conta de acesso">
            <div className="internal-customer-access__row">
              <p className="internal-customer-access__status">
                <span className={`internal-account-dot ${customer.customerAccount?.status === "ACTIVE" ? "internal-account-dot--active" : ""}`} aria-hidden="true" />
                {customer.customerAccount?.status === "ACTIVE"
                  ? "Ativa"
                  : customer.customerAccount?.status === "SUSPENDED"
                    ? "Suspensa"
                    : "Sem conta de acesso"}
              </p>

              {can("CUSTOMER_ACCOUNT_MANAGE") && customer.customerAccount && (
                <div className="internal-customer-access__actions">
                  <Button
                    variant="secondary" size="sm" disabled={lifecycleBusy}
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
                  </Button>
                  <Button
                    variant="danger" size="sm" disabled={lifecycleBusy}
                    onClick={() => setLifecycleAction("DELETE_ACCOUNT")}
                  >
                    Excluir conta de acesso
                  </Button>
                </div>
              )}
            </div>
          </PageSection>
        </div>
      </Surface>

      {can("OS_READ") && (
        <Surface className="internal-panel">
          <PageSection title="Histórico de ordens de serviço">
            {orderHistoryError ? (
              <ErrorBanner message={orderHistoryError} />
            ) : orders.length === 0 ? (
              <EmptyState title="Nenhuma ordem de serviço para este cliente." />
            ) : (
              <DataTable label="Ordens de serviço do cliente" framed={false}>
                <thead><tr><th>Ordem</th><th>Status</th><th>Prioridade</th></tr></thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="ui-data-table__wrap"><Link className="row-link" to={`/service-orders/${order.id}`}>{order.title}</Link></td>
                      <td><StatusBadge status={order.status} /></td>
                      <td><PriorityBadge priority={order.priority} /></td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </PageSection>
        </Surface>
      )}

      {(can("CUSTOMER_DELETE") || can("CUSTOMER_ANONYMIZE")) && !editing && (
        <Surface className="internal-panel internal-danger">
          <PageSection title="Zona de risco">
            <p>
              A exclusão física só é permitida quando não há histórico de ordens.
              Para preservar o histórico, use a anonimização.
            </p>
            <div className="internal-page__actions">
              {can("CUSTOMER_ANONYMIZE") && (
                <Button
                  variant="danger" size="sm" disabled={lifecycleBusy || deleting}
                  onClick={() => setLifecycleAction("ANONYMIZE")}
                >
                  Anonimizar cliente
                </Button>
              )}
              {can("CUSTOMER_DELETE") && (
                <Button variant="danger" size="sm" disabled={lifecycleBusy || deleting} onClick={() => setDeleteOpen(true)}>
                  Excluir cliente sem histórico
                </Button>
              )}
            </div>
          </PageSection>
        </Surface>
      )}

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
