import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import * as serviceOrdersApi from "../api/service-orders.ts";
import * as customersApi from "../api/customers.ts";
import type { Customer, ServiceOrderPriority } from "../api/types.ts";
import { SERVICE_ORDER_PRIORITIES, PRIORITY_LABELS } from "../api/types.ts";
import { Field } from "../components/Field.tsx";
import { ErrorBanner } from "../components/States.tsx";
import { ApiError } from "../api/client.ts";
import { fieldErrorsFromDetails } from "../api/errors.ts";
import { IconArrowLeft } from "../components/icons.tsx";

export function ServiceOrderNewPage() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ServiceOrderPriority>("MEDIUM");
  const [customerId, setCustomerId] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    customersApi
      .listCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (!customerId) {
      setFieldErrors({ customerId: "Selecione um cliente" });
      return;
    }

    setSubmitting(true);

    try {
      const order = await serviceOrdersApi.createServiceOrder({
        title,
        description,
        priority,
        customerId,
      });

      navigate(`/service-orders/${order.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(fieldErrorsFromDetails(err.details));
        setFormError("Verifique os campos destacados.");
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Não foi possível criar a ordem de serviço.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            <IconArrowLeft width={16} height={16} />
            Voltar
          </button>
          <h1 style={{ marginTop: 8 }}>Nova ordem de serviço</h1>
        </div>
      </div>

      <div className="card detail-section" style={{ maxWidth: 640 }}>
        {formError && <ErrorBanner message={formError} />}

        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Título" required error={fieldErrors.title}>
            {(props) => (
              <input
                {...props}
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Substituir cabo de rede"
              />
            )}
          </Field>

          <Field label="Descrição" required error={fieldErrors.description}>
            {(props) => (
              <textarea
                {...props}
                className="input"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhe o problema ou serviço solicitado"
              />
            )}
          </Field>

          <div className="form-grid">
            <Field label="Cliente" required error={fieldErrors.customerId}>
              {(props) => (
                <select
                  {...props}
                  className="input"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  disabled={!customers}
                >
                  <option value="">
                    {customers ? "Selecione um cliente" : "Carregando clientes..."}
                  </option>
                  {customers?.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.document ? ` — ${customer.document}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Prioridade" required>
              {(props) => (
                <select
                  {...props}
                  className="input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ServiceOrderPriority)}
                >
                  {SERVICE_ORDER_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          {customers?.length === 0 && (
            <p className="field-hint">
              Nenhum cliente cadastrado ainda. Cadastre um cliente antes de criar uma ordem.
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting || customers?.length === 0}>
              {submitting ? "Criando..." : "Criar ordem"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
