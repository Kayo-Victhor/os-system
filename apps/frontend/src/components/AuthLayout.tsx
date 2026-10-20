import { useEffect, useRef, type ReactNode } from "react";
import { Surface } from "./Surface.tsx";
import "../styles/auth-pages.css";

export function AuthLayout({ area, children, feedbackKey, variant = "form" }: {
  area: "internal" | "customer";
  children: ReactNode;
  feedbackKey?: string | null;
  variant?: "form" | "message";
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!feedbackKey) return;
    const target = contentRef.current?.querySelector<HTMLElement>('[role="alert"]')
      ?? contentRef.current?.querySelector<HTMLElement>('[role="status"]')
      ?? contentRef.current?.querySelector<HTMLElement>("h1");
    target?.setAttribute("tabindex", "-1");
    target?.focus();
  }, [feedbackKey]);

  const customer = area === "customer";
  return (
    <main className={`auth-page auth-page--${variant}`}>
      <div className="auth-composition">
        <aside className="auth-identity" aria-label="OS System">
          <div className="auth-brand">
            <span className="brand-mark" aria-hidden="true">OS</span>
            <div>
              <strong>OS System</strong>
              <span>
                {customer ? "Área do cliente" : "Acesso da equipe"}
              </span>
            </div>
          </div>
          <div className="auth-context">
            <h2>
              {customer ? "Acompanhe seus atendimentos." : "Sua central de serviços."}
            </h2>
            <p>
              {customer
                ? "Consulte suas ordens de serviço e acompanhe o histórico de cada atendimento."
                : "Acesse sua conta para organizar as ordens de serviço e acompanhar o atendimento."}
            </p>
          </div>
          <p className="auth-identity-note">
            {customer ? "Um espaço para acompanhar suas solicitações com clareza." : "Ambiente de trabalho da equipe de atendimento."}
          </p>
        </aside>
        <Surface className="auth-task" padded={false}>
          <div ref={contentRef}>
            {children}
          </div>
        </Surface>
      </div>
    </main>
  );
}
