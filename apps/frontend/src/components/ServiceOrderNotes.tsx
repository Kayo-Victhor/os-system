import { useCallback, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../api/client.ts";
import * as serviceOrdersApi from "../api/service-orders.ts";
import type { PaginatedServiceOrderNotes } from "../api/service-orders.ts";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";
import { ErrorBanner, SuccessBanner } from "./States.tsx";

const NOTE_MAX_LENGTH = 2000;

export function ServiceOrderNotes({
  serviceOrderId,
  canCreate,
}: {
  serviceOrderId: string;
  canCreate: boolean;
}) {
  const [notes, setNotes] = useState<PaginatedServiceOrderNotes | null>(null);
  const [page, setPage] = useState(1);
  const [content, setContent] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const latestLoadRef = useRef(0);
  const submittingRef = useRef(false);

  const loadNotes = useCallback(async (
    isActive: () => boolean = () => true,
    signal?: AbortSignal,
  ) => {
    const requestId = ++latestLoadRef.current;
    try {
      const response = await serviceOrdersApi.listServiceOrderNotes(
        serviceOrderId,
        page,
        signal,
      );
      if (!isActive() || requestId !== latestLoadRef.current) return;
      setNotes(response);
      setLoadError(false);
    } catch {
      if (isActive() && requestId === latestLoadRef.current) setLoadError(true);
    }
  }, [page, serviceOrderId]);

  useInitialAsyncLoad(loadNotes);

  async function refreshFirstPage() {
    const requestId = ++latestLoadRef.current;
    try {
      const response = await serviceOrdersApi.listServiceOrderNotes(serviceOrderId, 1);
      if (requestId !== latestLoadRef.current) return;
      setNotes(response);
      setLoadError(false);
    } catch {
      if (requestId === latestLoadRef.current) setLoadError(true);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      setSubmitError("Escreva uma nota antes de registrar.");
      return;
    }
    if (normalizedContent.length > NOTE_MAX_LENGTH) {
      setSubmitError(`A nota deve ter no máximo ${NOTE_MAX_LENGTH} caracteres.`);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      await serviceOrdersApi.createServiceOrderNote(
        serviceOrderId,
        normalizedContent,
      );
      setContent("");
      setSuccessMessage("Nota interna registrada com sucesso.");
      if (page === 1) await refreshFirstPage();
      else setPage(1);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível registrar a nota interna.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="card detail-section service-order-notes" aria-labelledby="notes-title">
      <div className="notes-header">
        <div>
          <h2 id="notes-title">Notas internas</h2>
          <p className="page-subtitle">Visíveis somente para a equipe interna.</p>
        </div>
        {notes && notes.pagination.total > 0 && (
          <span className="notes-count">{notes.pagination.total} nota(s)</span>
        )}
      </div>

      {canCreate && (
        <form className="notes-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="internal-note">Nova nota interna</label>
            <textarea
              id="internal-note"
              className="input"
              rows={4}
              maxLength={NOTE_MAX_LENGTH}
              value={content}
              aria-describedby="internal-note-limit"
              placeholder="Registre uma observação útil para a equipe..."
              onChange={(event) => setContent(event.target.value)}
            />
            <span id="internal-note-limit" className="field-hint">
              {content.length}/{NOTE_MAX_LENGTH} caracteres
            </span>
          </div>
          {submitError && <ErrorBanner message={submitError} />}
          {successMessage && <SuccessBanner message={successMessage} />}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={submitting || content.trim().length === 0}
          >
            {submitting ? "Registrando..." : "Registrar nota"}
          </button>
        </form>
      )}

      <div className="notes-content" aria-live="polite">
        {loadError ? (
          <div>
            <p className="timeline-empty">Não foi possível carregar as notas internas.</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void loadNotes()}
            >
              Tentar novamente
            </button>
          </div>
        ) : notes === null ? (
          <p className="timeline-empty">Carregando notas internas...</p>
        ) : notes.items.length === 0 ? (
          <p className="timeline-empty">
            Nenhuma nota interna registrada. As observações da equipe aparecerão aqui.
          </p>
        ) : (
          <>
            <ol className="notes-list" aria-label="Notas internas da ordem de serviço">
              {notes.items.map((note) => (
                <li key={note.id} className="note-item">
                  <p>{note.content}</p>
                  <div className="note-meta">
                    <strong>{note.author?.name ?? "Autor removido"}</strong>
                    <time dateTime={note.createdAt}>
                      {new Date(note.createdAt).toLocaleString("pt-BR")}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
            {notes.pagination.totalPages > 1 && (
              <nav className="pagination" aria-label="Paginação das notas internas">
                <span>
                  Página {notes.pagination.page} de {notes.pagination.totalPages}
                </span>
                <div className="pagination-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!notes.pagination.hasPreviousPage}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!notes.pagination.hasNextPage}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
