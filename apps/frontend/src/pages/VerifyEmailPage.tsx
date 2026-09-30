import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { resendEmailVerification, verifyEmail } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { ErrorBanner, SuccessBanner } from "../components/States.tsx";

type VerificationState = "idle" | "verifying" | "verified" | "invalid";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [state, setState] = useState<VerificationState>(token ? "verifying" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // React StrictMode intentionally re-runs effects in development. Keep this
  // credential one-shot in the browser as well as on the server.
  const submittedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || submittedTokenRef.current === token) return;
    submittedTokenRef.current = token;

    void verifyEmail(token)
      .then(({ message: success }) => { setState("verified"); setMessage(success); })
      .catch(() => { setState("invalid"); setMessage("Este link é inválido, expirou ou já foi utilizado."); });
  }, [token]);

  async function handleResend(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await resendEmailVerification(email);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Não foi possível reenviar a confirmação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <h1>Confirme seu e-mail</h1>
        {state === "verifying" && <p className="page-subtitle">Confirmando seu endereço de e-mail...</p>}
        {state === "verified" && message && <SuccessBanner message={message} />}
        {state === "invalid" && message && <ErrorBanner message={message} />}
        {state === "verified" ? (
          <Link className="btn btn-primary" to="/login">Entrar</Link>
        ) : (
          <>
            <p className="page-subtitle">Informe seu e-mail para receber um novo link de confirmação.</p>
            {message && state !== "invalid" && <SuccessBanner message={message} />}
            <form onSubmit={handleResend}>
              <label className="field">
                <span>E-mail</span>
                <input className="input" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Enviando..." : "Reenviar confirmação"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
