import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { resetCustomerAccountPassword } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { Field } from "../components/Field.tsx";
import { ErrorBanner, SuccessBanner } from "../components/States.tsx";

export function CustomerResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("Este link de redefinição é inválido.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError("A senha deve ter entre 8 e 128 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await resetCustomerAccountPassword(token, password);
      setMessage(result.message);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Não foi possível redefinir a senha. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <h1>Redefinir senha de cliente</h1>
        <p className="page-subtitle">Escolha uma nova senha para sua conta de cliente.</p>
        {message && <SuccessBanner message={message} />}
        {error && <ErrorBanner message={error} />}

        {!message && (
          <form onSubmit={submit} noValidate>
            <Field label="Nova senha" required hint="Use entre 8 e 128 caracteres">
              {(props) => (
                <input
                  {...props}
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
            <Field label="Confirmar nova senha" required>
              {(props) => (
                <input
                  {...props}
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              )}
            </Field>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Redefinindo..." : "Redefinir senha"}
            </button>
          </form>
        )}

        <p className="page-subtitle">
          <Link to="/customer/login">Voltar para entrar</Link>
        </p>
      </div>
    </div>
  );
}
