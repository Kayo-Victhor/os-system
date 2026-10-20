import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import * as usersApi from "../api/users.ts";
import { Field } from "../components/Field.tsx";
import { ErrorBanner } from "../components/States.tsx";
import { ApiError } from "../api/client.ts";
import { fieldErrorsFromDetails } from "../api/errors.ts";
import { IconArrowLeft } from "../components/icons.tsx";
import { Button } from "../components/Button.tsx";
import { PageHeader, PageSection } from "../components/PageHeader.tsx";
import { Surface } from "../components/Surface.tsx";
import { FormActions, InternalForm } from "../components/InternalForm.tsx";

export function UserNewPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "ATTENDANT" | "TECHNICIAN">("ATTENDANT");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await usersApi.createUser({ name, email, password, role });
      navigate("/users", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(fieldErrorsFromDetails(err.details));
        setFormError("Verifique os campos destacados.");
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Não foi possível criar o usuário.");
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
      <PageHeader title="Novo usuário" description="Cadastre uma conta para a equipe interna de atendimento." />

      <Surface className="internal-panel">
        {formError && <ErrorBanner message={formError} />}

        <InternalForm onSubmit={handleSubmit} noValidate busy={submitting} errors={fieldErrors}>
          <PageSection title="Identificação">
            <div className="form-grid">
              <Field label="Nome" required error={fieldErrors.name}>
                {(props) => <input {...props} className="input" value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>

              <Field label="E-mail" required error={fieldErrors.email}>
                {(props) => (
                  <input {...props} type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                )}
              </Field>

            </div>
          </PageSection>
          <PageSection title="Acesso ao sistema">
            <div className="form-grid">
              <Field
                label="Senha temporária"
                required
                error={fieldErrors.password}
                hint="O usuário poderá alterá-la depois do primeiro acesso."
              >
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>

              <Field label="Papel" required error={fieldErrors.role}>
                {(props) => (
                  <select {...props} className="input" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "ATTENDANT" | "TECHNICIAN")}>
                    <option value="ADMIN">Administrador</option>
                    <option value="ATTENDANT">Atendente</option>
                    <option value="TECHNICIAN">Técnico</option>
                  </select>
                )}
              </Field>

            </div>
          </PageSection>
          <FormActions busy={submitting} label="Criar usuário" onCancel={() => navigate(-1)} />
        </InternalForm>
      </Surface>
    </div>
  );
}
