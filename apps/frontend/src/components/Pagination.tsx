import { Button } from "./Button.tsx";

interface PaginationData {
  page: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export function Pagination({
  label,
  pagination,
  itemLabel,
  onPageChange,
}: {
  label: string;
  pagination: PaginationData;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="ui-pagination" aria-label={label}>
      <p aria-live="polite">
        Página {pagination.page} de {pagination.totalPages} · {pagination.total} {itemLabel}
      </p>
      <div className="ui-pagination__actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={!pagination.hasPreviousPage}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Página anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!pagination.hasNextPage}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Próxima página
        </Button>
      </div>
    </nav>
  );
}
