import { Field } from "../components/Field.tsx";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { Button } from "../components/Button.tsx";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { ErrorBanner, SuccessBanner } from "../components/States.tsx";
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      setMessage((await requestPasswordReset(email)).message);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Não foi possível solicitar a redefinição.");
    } finally {
      setSubmitting(false);
    }
  }
  return <AuthLayout area="internal" feedbackKey={submitting ? null : error ?? message}>
    <div className="auth-form-content">
      <h1>Recuperar senha</h1>
      <p className="page-subtitle">Informe seu e-mail para receber as instruções.</p>
      {message && <SuccessBanner message={message} />}{error && <ErrorBanner message={error} />}<form onSubmit={submit}>
        <Field label="E-mail" required>
          {(props) => <input
            {...props}
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />}
        </Field>
        <Button type="submit" loading={submitting}>
          {submitting ? "Enviando..." : "Enviar instruções"}
        </Button>
      </form>
      <p className="page-subtitle">
        <Link to="/login">Voltar para entrar</Link>
      </p>
    </div>
  </AuthLayout>;
}
