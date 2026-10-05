import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { requestCustomerAccountPasswordReset } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { Field } from "../components/Field.tsx";
import { ErrorBanner, SuccessBanner } from "../components/States.tsx";

export function CustomerForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      const result = await requestCustomerAccountPasswordReset(email);
      setMessage(result.message);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Não foi possível solicitar a redefinição. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <h1>Recuperar senha de cliente</h1>
        <p className="page-subtitle">
          Informe o e-mail da sua conta de cliente para receber as instruções.
        </p>
        {message && <SuccessBanner message={message} />}
        {error && <ErrorBanner message={error} />}

        <form onSubmit={submit} noValidate>
          <Field label="E-mail" required>
            {(props) => (
              <input
                {...props}
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Enviando..." : "Enviar instruções"}
          </button>
        </form>

        <p className="page-subtitle">
          <Link to="/login">Voltar para entrar</Link>
        </p>
      </div>
    </div>
  );
}
