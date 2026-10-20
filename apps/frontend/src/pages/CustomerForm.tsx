import { useState, type FormEvent } from "react";

import type { CustomerInput } from "../api/customers.ts";
import { Field } from "../components/Field.tsx";
import { PageSection } from "../components/PageHeader.tsx";
import { FormActions, InternalForm } from "../components/InternalForm.tsx";

interface CustomerFormProps {
  initial?: Partial<CustomerInput>;
  fieldErrors: Record<string, string>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (data: CustomerInput) => void;
  onCancel?: () => void;
}

export function CustomerForm({
  initial,
  fieldErrors,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: CustomerFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [documentNumber, setDocumentNumber] = useState(initial?.document ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    onSubmit({
      name,
      email: email || undefined,
      phone: phone || undefined,
      document: documentNumber || undefined,
      address: address || undefined,
    });
  }

  return (
    <InternalForm onSubmit={handleSubmit} noValidate busy={submitting} errors={fieldErrors}>
      <PageSection title="Dados cadastrais">
        <div className="form-grid">
          <Field label="Nome" required error={fieldErrors.name}>
            {(props) => <input {...props} className="input" value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>

          <Field label="Documento (CPF/CNPJ)" error={fieldErrors.document} hint="Opcional">
            {(props) => <input {...props} className="input" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />}
          </Field>
        </div>
      </PageSection>
      <PageSection title="Contato e endereço">
        <div className="internal-form__group">
          <div className="form-grid">
            <Field label="E-mail" error={fieldErrors.email} hint="Opcional">
              {(props) => (
                <input {...props} type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
            </Field>

            <Field label="Telefone" error={fieldErrors.phone} hint="Opcional">
              {(props) => (
                <input {...props} type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              )}
            </Field>

          </div>
          <Field label="Endereço" error={fieldErrors.address} hint="Opcional">
            {(props) => (
              <input {...props} className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
            )}
          </Field>
        </div>
      </PageSection>
      <FormActions busy={submitting} label={submitLabel} onCancel={onCancel} />
    </InternalForm>
  );
}
