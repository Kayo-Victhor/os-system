import { useEffect, useRef, type ReactNode } from "react";
import { IconAlert, IconEmpty } from "./icons.tsx";
import { Button } from "./Button.tsx";

export function PageLoading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="page-loading" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-block">
      <IconEmpty width={32} height={32} style={{ color: "var(--color-text-faint)" }} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-block" role="alert">
      <IconAlert width={32} height={32} style={{ color: "var(--color-danger)" }} />
      <h3>Não foi possível carregar os dados</h3>
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>Tentar novamente</Button>
      )}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner banner-error" role="alert">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="banner banner-success" role="status">
      {message}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {busy ? "Aguarde..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SessionRestoringShell() {
  return (
    <div className="session-shell" aria-busy="true" aria-live="polite">
      <aside className="session-sidebar" aria-hidden="true">
        <div className="session-brand"><span>OS</span><div><i /><i /></div></div>
        <div className="session-nav"><i /><i /><i /><i /></div>
      </aside>
      <main className="session-main">
        <header className="session-topbar"><i /></header>
        <div className="session-content">
          <p className="sr-only">Restaurando sua sessão...</p>
          <i className="session-title" />
          <i className="session-subtitle" />
          <div className="session-cards"><i /><i /><i /><i /></div>
          <div className="session-table"><i /><i /><i /><i /></div>
        </div>
      </main>
    </div>
  );
}

export function SessionRestoreError({ onRetry, loginAction }: { onRetry: () => void; loginAction: ReactNode }) {
  return (
    <div className="state-block" role="alert" aria-live="assertive">
      <IconAlert width={32} height={32} style={{ color: "var(--color-danger)" }} />
      <h3>Não foi possível verificar sua sessão</h3>
      <p>A conexão demorou mais do que o esperado. Tente novamente sem sair da sua conta.</p>
      <div className="session-error-actions">
        <Button onClick={onRetry}>Tentar novamente</Button>
        {loginAction}
      </div>
    </div>
  );
}
