import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { ErrorBanner, SuccessBanner } from "../components/States.tsx";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(null); setSubmitting(true); try { setMessage((await requestPasswordReset(email)).message); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Não foi possível solicitar a redefinição."); } finally { setSubmitting(false); } }
  return <div className="auth-screen"><div className="auth-card card"><h1>Recuperar senha</h1><p className="page-subtitle">Informe seu e-mail para receber as instruções.</p>{message && <SuccessBanner message={message} />}{error && <ErrorBanner message={error} />}<form onSubmit={submit}><label className="field"><span>E-mail</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? "Enviando..." : "Enviar instruções"}</button></form><p className="page-subtitle"><Link to="/login">Voltar para entrar</Link></p></div></div>;
}
