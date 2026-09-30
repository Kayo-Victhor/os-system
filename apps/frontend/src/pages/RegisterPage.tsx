import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerCustomer } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import { Field } from "../components/Field.tsx";
import { ErrorBanner } from "../components/States.tsx";

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", document: "", address: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const update = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSubmitting(true);
    try {
      await registerCustomer({ ...form, phone: form.phone || undefined, document: form.document || undefined, address: form.address || undefined });
      navigate(`/verificar-email?email=${encodeURIComponent(form.email)}`, { replace: true });
    } catch (err) { setError(err instanceof ApiError ? err.message : "Não foi possível criar sua conta. Tente novamente."); }
    finally { setSubmitting(false); }
  }
  return <div className="auth-screen"><div className="auth-card card"><h1>Criar conta</h1><p className="page-subtitle">Cadastre-se para acompanhar seus atendimentos.</p>{error && <ErrorBanner message={error} />}<form onSubmit={submit} noValidate>
    <Field label="Nome completo" required>{(props) => <input {...props} className="input" value={form.name} onChange={update("name")} autoComplete="name" />}</Field>
    <Field label="E-mail" required>{(props) => <input {...props} type="email" className="input" value={form.email} onChange={update("email")} autoComplete="email" />}</Field>
    <Field label="Senha" required hint="Use pelo menos 8 caracteres">{(props) => <input {...props} type="password" minLength={8} maxLength={128} className="input" value={form.password} onChange={update("password")} autoComplete="new-password" />}</Field>
    <Field label="Telefone">{(props) => <input {...props} className="input" value={form.phone} onChange={update("phone")} autoComplete="tel" />}</Field>
    <Field label="Documento">{(props) => <input {...props} className="input" value={form.document} onChange={update("document")} />}</Field>
    <Field label="Endereço">{(props) => <input {...props} className="input" value={form.address} onChange={update("address")} autoComplete="street-address" />}</Field>
    <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Criando conta..." : "Criar conta"}</button>
  </form><p className="page-subtitle">Já possui conta? <Link to="/login">Entrar</Link></p></div></div>;
}
