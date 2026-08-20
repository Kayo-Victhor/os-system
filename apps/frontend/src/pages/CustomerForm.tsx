import { useState, type FormEvent } from "react";

import type { CustomerInput } from "../api/customers.ts";
import { Field } from "../components/Field.tsx";

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
    onSubmit({
      name,
      email: email || undefined,
      phone: phone || undefined,
      document: documentNumber || undefined,
      address: address || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Nome" required error={fieldErrors.name}>
        {(props) => <input {...props} className="input" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>

      <div className="form-grid">
        <Field label="E-mail" error={fieldErrors.email} hint="Opcional">
          {(props) => (
            <input {...props} type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>

        <Field label="Telefone" error={fieldErrors.phone} hint="Opcional">
          {(props) => (
            <input {...props} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          )}
        </Field>

        <Field label="Documento (CPF/CNPJ)" error={fieldErrors.document} hint="Opcional">
          {(props) => (
            <input {...props} className="input" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
          )}
        </Field>

        <Field label="Endereço" error={fieldErrors.address} hint="Opcional">
          {(props) => (
            <input {...props} className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          )}
        </Field>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Salvando..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
