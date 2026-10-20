import { useState } from "react";
import { useNavigate } from "react-router-dom";

import * as customersApi from "../api/customers.ts";
import type { CustomerInput } from "../api/customers.ts";
import { ErrorBanner } from "../components/States.tsx";
import { ApiError } from "../api/client.ts";
import { fieldErrorsFromDetails } from "../api/errors.ts";
import { CustomerForm } from "./CustomerForm.tsx";
import { IconArrowLeft } from "../components/icons.tsx";
import { Button } from "../components/Button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { Surface } from "../components/Surface.tsx";

export function CustomerNewPage() {
  const navigate = useNavigate();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(data: CustomerInput) {
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      const customer = await customersApi.createCustomer(data);
      navigate(`/customers/${customer.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(fieldErrorsFromDetails(err.details));
        setFormError("Verifique os campos destacados.");
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Não foi possível criar o cliente.");
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
      <PageHeader title="Novo cliente" description="Cadastre os dados do cliente para organizar seus atendimentos." />

      <Surface className="internal-panel">
        {formError && <ErrorBanner message={formError} />}
        <CustomerForm
          fieldErrors={fieldErrors}
          submitting={submitting}
          submitLabel="Criar cliente"
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
        />
      </Surface>
    </div>
  );
}
