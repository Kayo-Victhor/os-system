import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import * as customersApi from "../api/customers.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { PageLoading, ErrorState, EmptyState } from "../components/States.tsx";
import { IconPlus, IconSearch } from "../components/icons.tsx";

export function CustomersListPage() {
  const { can, user } = useAuth();
  const [customers, setCustomers] = useState<customersApi.PaginatedCustomers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);

    try {
      const data = await customersApi.listCustomers({
        search: search.trim() || undefined,
        page,
      }, signal);
      setCustomers(data);
    } catch {
      if (signal?.aborted) return;
      setError("Não foi possível carregar os clientes.");
    }
  }, [page, search]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { void load(controller.signal); }, search ? 300 : 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [load, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p className="page-subtitle">{user?.role === "TECHNICIAN" ? "Consulte os clientes vinculados à sua fila e cadastre atendimentos presenciais." : "Consulte e gerencie os clientes cadastrados."}</p>
        </div>
        {can("CUSTOMER_CREATE") && (
          <Link to="/customers/new" className="btn btn-primary">
            <IconPlus width={16} height={16} />
            Novo cliente
          </Link>
        )}
      </div>

      <div className="toolbar">
        <div style={{ position: "relative" }}>
          <IconSearch
            width={15}
            height={15}
            style={{ position: "absolute", left: 10, top: 10, color: "var(--color-text-faint)" }}
          />
          <input
            type="search"
            className="input"
            placeholder="Buscar por nome, e-mail ou documento"
            style={{ paddingLeft: 30, minWidth: 260 }}
            value={search}
            onChange={(e) => {
              setCustomers(null);
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Buscar clientes"
          />
        </div>
      </div>

      {customers === null && !error && <PageLoading />}
      {error && <ErrorState message={error} onRetry={load} />}

      {customers && customers.items.length === 0 && (
        <EmptyState
          title="Não há clientes cadastrados."
          description={search ? "Nenhum cliente corresponde à busca." : "Cadastre o primeiro cliente para começar."}
        />
      )}

      {customers && customers.items.length > 0 && (
        <div className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Documento</th>
              </tr>
            </thead>
            <tbody>
              {customers.items.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link to={`/customers/${customer.id}`} className="row-link">
                      {customer.name}
                    </Link>
                  </td>
                  <td>{customer.email ?? "—"}</td>
                  <td>{customer.phone ?? "—"}</td>
                  <td>{customer.document ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {customers && customers.pagination.total > 0 && (
        <nav className="pagination" aria-label="Paginação dos clientes">
          <p aria-live="polite">
            Página {customers.pagination.page} de {customers.pagination.totalPages} · {customers.pagination.total} cliente(s)
          </p>
          <div className="pagination-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!customers.pagination.hasPreviousPage}
              onClick={() => setPage((currentPage) => currentPage - 1)}
            >
              Página anterior
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!customers.pagination.hasNextPage}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              Próxima página
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
