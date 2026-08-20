import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import * as customersApi from "../api/customers.ts";
import type { Customer } from "../api/types.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { PageLoading, ErrorState, EmptyState } from "../components/States.tsx";
import { IconPlus, IconSearch } from "../components/icons.tsx";

export function CustomersListPage() {
  const { can } = useAuth();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);

    try {
      const data = await customersApi.listCustomers(search.trim() || undefined);
      setCustomers(data);
    } catch {
      setError("Não foi possível carregar os clientes.");
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [load, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p className="page-subtitle">Consulte e gerencie os clientes cadastrados.</p>
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
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar clientes"
          />
        </div>
      </div>

      {customers === null && !error && <PageLoading />}
      {error && <ErrorState message={error} onRetry={load} />}

      {customers && customers.length === 0 && (
        <EmptyState
          title="Não há clientes cadastrados."
          description={search ? "Nenhum cliente corresponde à busca." : "Cadastre o primeiro cliente para começar."}
        />
      )}

      {customers && customers.length > 0 && (
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
              {customers.map((customer) => (
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
    </div>
  );
}
