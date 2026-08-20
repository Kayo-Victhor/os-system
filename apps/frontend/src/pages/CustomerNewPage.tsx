import { useState } from "react";
import { useNavigate } from "react-router-dom";

import * as customersApi from "../api/customers.ts";
import type { CustomerInput } from "../api/customers.ts";
import { ErrorBanner } from "../components/States.tsx";
import { ApiError } from "../api/client.ts";
import { fieldErrorsFromDetails } from "../api/errors.ts";
import { CustomerForm } from "./CustomerForm.tsx";
import { IconArrowLeft } from "../components/icons.tsx";

export function CustomerNewPage() {
  const navigate = useNavigate();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(data: CustomerInput) {
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
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
        <IconArrowLeft width={16} height={16} />
        Voltar
      </button>
      <h1 style={{ marginTop: 8, marginBottom: 20 }}>Novo cliente</h1>

      <div className="card detail-section" style={{ maxWidth: 640 }}>
        {formError && <ErrorBanner message={formError} />}
        <CustomerForm
          fieldErrors={fieldErrors}
          submitting={submitting}
          submitLabel="Criar cliente"
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  );
}
