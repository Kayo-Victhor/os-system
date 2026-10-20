import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import * as customersApi from "../api/customers.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { PageLoading, ErrorState, EmptyState } from "../components/States.tsx";
import { CustomerAccountStatusBadge } from "../components/Badges.tsx";
import { IconPlus } from "../components/icons.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { ButtonLink } from "../components/Button.tsx";
import { FilterBar, SearchField } from "../components/FilterBar.tsx";
import { DataTable } from "../components/DataTable.tsx";
import { Pagination } from "../components/Pagination.tsx";

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
    <div className="operational-page">
      <PageHeader
        title="Clientes"
        description={user?.role === "TECHNICIAN"
          ? "Consulte os clientes vinculados à sua fila e cadastre atendimentos presenciais."
          : "Consulte e gerencie os clientes cadastrados."}
        actions={can("CUSTOMER_CREATE") ? (
          <ButtonLink to="/customers/new">
            <IconPlus width={16} height={16} />
            Novo cliente
          </ButtonLink>
        ) : undefined}
      />

      <FilterBar label="Busca de clientes">
        <SearchField
          placeholder="Buscar por nome, e-mail ou documento"
          value={search}
          onChange={(event) => {
            setCustomers(null);
            setSearch(event.target.value);
            setPage(1);
          }}
          aria-label="Buscar clientes"
        />
      </FilterBar>

      {customers === null && !error && <PageLoading />}
      {error && <ErrorState message={error} onRetry={load} />}

      {customers && customers.items.length === 0 && (
        <EmptyState
          title="Não há clientes cadastrados."
          description={search ? "Nenhum cliente corresponde à busca." : "Cadastre o primeiro cliente para começar."}
        />
      )}

      {customers && customers.items.length > 0 && (
        <DataTable label="Clientes cadastrados">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Documento</th>
                <th>Acesso</th>
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
                  <td>
                    {customer.customerAccount
                      ? <CustomerAccountStatusBadge status={customer.customerAccount.status} />
                      : <span className="ui-data-table__muted">Sem acesso</span>}
                  </td>
                </tr>
              ))}
            </tbody>
        </DataTable>
      )}

      {customers && customers.pagination.total > 0 && (
        <Pagination
          label="Paginação dos clientes"
          pagination={customers.pagination}
          itemLabel="cliente(s)"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
