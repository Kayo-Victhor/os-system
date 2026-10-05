import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.ts";
import { Field } from "../components/Field.tsx";
import { ErrorBanner } from "../components/States.tsx";
import { useCustomerAuth } from "../hooks/useCustomerAuth.ts";

export function CustomerLoginPage() {
  const { status, login } = useCustomerAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") {
    const redirectTo =
      (location.state as { from?: string } | null)?.from ?? "/customer/area";
    return <Navigate to={redirectTo} replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/customer/area", { replace: true });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else if (reason instanceof ApiError) {
        setError(reason.message);
      } else {
        setError("Não foi possível conectar ao servidor. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <h1>Área do cliente</h1>
        <p className="page-subtitle">Entre para acompanhar seus atendimentos.</p>
        {error && <ErrorBanner message={error} />}
        <form onSubmit={submit} noValidate>
          <Field label="E-mail" required>
            {(props) => (
              <input
                {...props}
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
          <Field label="Senha" required>
            {(props) => (
              <input
                {...props}
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="page-subtitle">
          <Link to="/customer/forgot-password">Esqueci minha senha</Link>
        </p>
        <p className="page-subtitle">
          Ainda não possui conta? <Link to="/registrar">Criar conta</Link>
        </p>
        <p className="page-subtitle">
          Acesso da equipe? <Link to="/login">Entrar como colaborador</Link>
        </p>
      </div>
    </div>
  );
}
