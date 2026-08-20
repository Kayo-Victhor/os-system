import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import * as customersApi from "../api/customers.ts";
import * as serviceOrdersApi from "../api/service-orders.ts";
import type { Customer, ServiceOrder } from "../api/types.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { PageLoading, ErrorState, ErrorBanner, SuccessBanner, ConfirmDialog, EmptyState } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";
import { fieldErrorsFromDetails } from "../api/errors.ts";
import { CustomerForm } from "./CustomerForm.tsx";
import { IconArrowLeft } from "../components/icons.tsx";

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

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);

    try {
      const [customerData, orderData] = await Promise.all([
        customersApi.getCustomer(id),
        can("OS_READ") ? serviceOrdersApi.listServiceOrders({ customerId: id }) : Promise.resolve([]),
      ]);
      setCustomer(customerData);
      setOrders(orderData);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? "Cliente não encontrado."
          : "Não foi possível carregar o cliente.",
      );
    }
  }, [id, can]);

  useEffect(() => {
    load();
  }, [load]);

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

          {can("CUSTOMER_DELETE") && !editing && (
            <div className="card detail-section">
              <h2>Zona de risco</h2>
              <p className="page-subtitle" style={{ marginBottom: 12 }}>
                Excluir um cliente é permanente e não pode ser desfeito.
              </p>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>
                Excluir cliente
              </button>
            </div>
          )}
        </div>

        {can("OS_READ") && (
          <div className="card detail-section">
            <h2>Histórico de ordens de serviço</h2>
            {orders.length === 0 ? (
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
        description={`Tem certeza que deseja excluir "${customer.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
