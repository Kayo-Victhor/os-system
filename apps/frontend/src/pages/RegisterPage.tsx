import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { registerCustomer, resendCustomerRegistration } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { Field } from "../components/Field.tsx";
import { ErrorBanner, SuccessBanner } from "../components/States.tsx";

export function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", document: "", address: "" });
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const update = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSubmitting(true);
    try {
      const result = await registerCustomer({ ...form, phone: form.phone || undefined, document: form.document || undefined, address: form.address || undefined });
      setPendingEmail(form.email.trim().toLowerCase());
      setMessage(result.message);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Não foi possível criar sua conta. Tente novamente."); }
    finally { setSubmitting(false); }
  }
  async function resend() {
    if (!pendingEmail) return;
    setError(null); setMessage(null); setSubmitting(true);
    try {
      const result = await resendCustomerRegistration(pendingEmail);
      setMessage(result.message);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Não foi possível reenviar a confirmação."); }
    finally { setSubmitting(false); }
  }
  if (pendingEmail) return <div className="auth-screen"><div className="auth-card card"><h1>Verifique seu e-mail</h1><p className="page-subtitle">Seu cadastro está pendente. A conta e o cadastro de cliente somente serão criados após a confirmação.</p>{message && <SuccessBanner message={message} />}{error && <ErrorBanner message={error} />}<button className="btn btn-primary" type="button" disabled={submitting} onClick={resend}>{submitting ? "Enviando..." : "Reenviar confirmação"}</button><p className="page-subtitle"><Link to="/customer/login">Voltar para entrar</Link></p></div></div>;
  return <div className="auth-screen"><div className="auth-card card"><h1>Criar conta</h1><p className="page-subtitle">Cadastre-se para acompanhar seus atendimentos.</p>{error && <ErrorBanner message={error} />}<form onSubmit={submit} noValidate>
    <Field label="Nome completo" required>{(props) => <input {...props} className="input" value={form.name} onChange={update("name")} autoComplete="name" />}</Field>
    <Field label="E-mail" required>{(props) => <input {...props} type="email" className="input" value={form.email} onChange={update("email")} autoComplete="email" />}</Field>
    <Field label="Senha" required hint="Use pelo menos 8 caracteres">{(props) => <input {...props} type="password" minLength={8} maxLength={128} className="input" value={form.password} onChange={update("password")} autoComplete="new-password" />}</Field>
    <Field label="Telefone">{(props) => <input {...props} className="input" value={form.phone} onChange={update("phone")} autoComplete="tel" />}</Field>
    <Field label="Documento">{(props) => <input {...props} className="input" value={form.document} onChange={update("document")} />}</Field>
    <Field label="Endereço">{(props) => <input {...props} className="input" value={form.address} onChange={update("address")} autoComplete="street-address" />}</Field>
    <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Enviando solicitação..." : "Solicitar cadastro"}</button>
  </form><p className="page-subtitle">Já possui conta? <Link to="/customer/login">Entrar</Link></p></div></div>;
}
