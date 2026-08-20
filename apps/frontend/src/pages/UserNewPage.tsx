import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import * as usersApi from "../api/users.ts";
import { Field } from "../components/Field.tsx";
import { ErrorBanner } from "../components/States.tsx";
import { ApiError } from "../api/client.ts";
import { fieldErrorsFromDetails } from "../api/errors.ts";
import { IconArrowLeft } from "../components/icons.tsx";

export function UserNewPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "TECHNICIAN">("USER");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
        <IconArrowLeft width={16} height={16} />
        Voltar
      </button>
      <h1 style={{ marginTop: 8, marginBottom: 20 }}>Novo usuário</h1>

      <div className="card detail-section" style={{ maxWidth: 480 }}>
        {formError && <ErrorBanner message={formError} />}

        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Nome" required error={fieldErrors.name}>
            {(props) => <input {...props} className="input" value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>

          <Field label="E-mail" required error={fieldErrors.email}>
            {(props) => (
              <input {...props} type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>

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

          <Field label="Papel" required>
            {(props) => (
              <select {...props} className="input" value={role} onChange={(e) => setRole(e.target.value as "USER" | "TECHNICIAN")}>
                <option value="USER">Atendente</option>
                <option value="TECHNICIAN">Técnico</option>
              </select>
            )}
          </Field>

          <p className="field-hint">
            Contas de administrador não podem ser criadas por aqui — altere o papel de um usuário existente na
            lista de usuários, se necessário.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Criando..." : "Criar usuário"}
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
