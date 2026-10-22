import { Component, type ErrorInfo, type ReactNode } from "react";

import { clearChunkRecoveryAttempt } from "../chunkRecovery.ts";
import { Button } from "./Button.tsx";
import { IconAlert } from "./icons.tsx";

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("A interface não pôde ser carregada.", error, info);
  }

  private retry = () => {
    try {
      clearChunkRecoveryAttempt(window.sessionStorage);
    } catch {
      // Reload still works when the browser blocks access to sessionStorage.
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="state-block app-load-error" role="alert" aria-live="assertive">
        <IconAlert width={32} height={32} style={{ color: "var(--color-danger)" }} />
        <h1>Não foi possível carregar o sistema</h1>
        <p>O navegador não conseguiu obter uma parte atualizada da aplicação.</p>
        <Button onClick={this.retry}>Tentar novamente</Button>
        <details>
          <summary>Detalhes do erro</summary>
          <code>{this.state.error.message}</code>
        </details>
      </main>
    );
  }
}
