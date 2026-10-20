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
import { Button } from "../components/Button.tsx";
import { PageHeader, PageSection } from "../components/PageHeader.tsx";
import { Surface } from "../components/Surface.tsx";
import { FormActions, InternalForm } from "../components/InternalForm.tsx";

export function ServiceOrderNewPage() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ServiceOrderPriority>("MEDIUM");
  const [customerId, setCustomerId] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      customersApi
        .listCustomers({ search: customerSearch.trim() || undefined, limit: 20 }, controller.signal)
        .then((result) => setCustomers(result.items))
        .catch(() => {
          if (!controller.signal.aborted) setCustomers([]);
        });
    }, customerSearch ? 250 : 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [customerSearch]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
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
    <div className="internal-page internal-create">
      <Button variant="neutral" size="sm" className="internal-page__back" onClick={() => navigate(-1)}>
        <IconArrowLeft width={16} height={16} />
        Voltar
      </Button>
      <PageHeader title="Nova ordem de serviço" description="Descreva a solicitação e vincule o cliente ao atendimento." />

      <Surface className="internal-panel">
        {formError && <ErrorBanner message={formError} />}

        <InternalForm onSubmit={handleSubmit} noValidate busy={submitting} errors={fieldErrors}>
          <PageSection title="Solicitação">
            <div className="internal-form__group">
              <div className="form-grid">
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

                <Field label="Prioridade" required error={fieldErrors.priority}>
                  {(props) => (
                    <select {...props} className="input" value={priority} onChange={(e) => setPriority(e.target.value as ServiceOrderPriority)}>
                      {SERVICE_ORDER_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                    </select>
                  )}
                </Field>
              </div>

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

            </div>
          </PageSection>
          <PageSection title="Cliente do atendimento">
            <div className="form-grid">
              <Field label="Buscar cliente">
                {(props) => (
                  <input
                    {...props}
                    type="search"
                    className="input"
                    value={customerSearch}
                    onChange={(event) => {
                      setCustomers(null);
                      setCustomerSearch(event.target.value);
                    }}
                    placeholder="Nome, e-mail ou documento"
                  />
                )}
              </Field>

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
                      {customers ? "Selecione um cliente" : "Buscando clientes..."}
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

            </div>

            {customers?.length === 0 && (
              <p className="field-hint">
                {customerSearch ? "Nenhum cliente corresponde à busca. Tente outro nome, e-mail ou documento." : "Nenhum cliente cadastrado ainda. Cadastre um cliente antes de criar uma ordem."}
              </p>
            )}

          </PageSection>
          <FormActions busy={submitting} disabled={customers?.length === 0} label="Criar ordem" onCancel={() => navigate(-1)} />
        </InternalForm>
      </Surface>
    </div>
  );
}
