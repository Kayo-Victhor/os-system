import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import * as serviceOrdersApi from "../api/service-orders.ts";
import type { ServiceOrderPriority, ServiceOrderStatus } from "../api/types.ts";
import { SERVICE_ORDER_STATUSES, SERVICE_ORDER_PRIORITIES, STATUS_LABELS, PRIORITY_LABELS } from "../api/types.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { PageLoading, ErrorState, EmptyState } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { IconPlus } from "../components/icons.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { Button, ButtonLink } from "../components/Button.tsx";
import { FilterBar, SearchField } from "../components/FilterBar.tsx";
import { DataTable } from "../components/DataTable.tsx";
import { Pagination } from "../components/Pagination.tsx";

export function ServiceOrdersListPage() {
  const { can, user } = useAuth();
  const [orders, setOrders] = useState<serviceOrdersApi.PaginatedServiceOrders | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ServiceOrderStatus | "">("");
  const [priority, setPriority] = useState<ServiceOrderPriority | "">("");
  const [page, setPage] = useState(1);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);

    try {
      const data = await serviceOrdersApi.listServiceOrders({
        status: status || undefined,
        priority: priority || undefined,
        search: search.trim() || undefined,
        page,
      }, signal);

      setOrders(data);
    } catch {
      if (signal?.aborted) return;
      setError("Não foi possível carregar as ordens de serviço.");
    }
  }, [page, priority, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { void load(controller.signal); }, search ? 300 : 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [load, search]);

  function clearFilters() {
    setOrders(null);
    setSearch("");
    setStatus("");
    setPriority("");
    setPage(1);
  }

  const filtersActive = Boolean(search || status || priority);

  return (
    <div className="operational-page">
      <PageHeader
        title="Ordens de serviço"
        description="Acompanhe e gerencie as ordens de serviço."
        actions={can("OS_CREATE") ? (
          <ButtonLink to="/service-orders/new">
            <IconPlus width={16} height={16} />
            Nova ordem
          </ButtonLink>
        ) : undefined}
      />

      <FilterBar
        label="Filtros das ordens de serviço"
        context={user?.role === "TECHNICIAN" ? "Sua fila atribuída" : undefined}
        actions={filtersActive ? (
          <Button variant="neutral" size="sm" onClick={clearFilters}>Limpar filtros</Button>
        ) : undefined}
      >
        <SearchField
          placeholder="Buscar por título ou descrição"
          value={search}
          onChange={(event) => {
            setOrders(null);
            setSearch(event.target.value);
            setPage(1);
          }}
          aria-label="Buscar ordens de serviço"
        />

        <select
          className="input ui-filter-control"
          value={status}
          onChange={(e) => {
            setOrders(null);
            setStatus(e.target.value as ServiceOrderStatus | "");
            setPage(1);
          }}
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {SERVICE_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          className="input ui-filter-control"
          value={priority}
          onChange={(e) => {
            setOrders(null);
            setPriority(e.target.value as ServiceOrderPriority | "");
            setPage(1);
          }}
          aria-label="Filtrar por prioridade"
        >
          <option value="">Todas as prioridades</option>
          {SERVICE_ORDER_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>

      </FilterBar>

      {orders === null && !error && <PageLoading />}
      {error && <ErrorState message={error} onRetry={load} />}

      {orders && orders.items.length === 0 && (
        <EmptyState
          title="Não há ordens de serviço cadastradas."
          description={
            search || status || priority
              ? "Nenhuma ordem corresponde aos filtros selecionados."
              : "Quando uma ordem for criada, ela aparecerá aqui."
          }
        />
      )}

      {orders && orders.items.length > 0 && (
        <DataTable label="Ordens de serviço">
            <thead>
              <tr>
                <th>Título</th>
                <th>Cliente</th>
                <th>Técnico</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Atualizada em</th>
              </tr>
            </thead>
            <tbody>
              {orders.items.map((order) => (
                <tr key={order.id}>
                  <td className="ui-data-table__wrap">
                    <Link to={`/service-orders/${order.id}`} className="row-link">
                      <span className="order-title">{order.title}</span>
                      <span className="order-reference">#{order.id.slice(-6).toUpperCase()}</span>
                    </Link>
                  </td>
                  <td>{order.customer.name}</td>
                  <td className={order.technician ? undefined : "ui-data-table__muted"}>
                    {order.technician?.name ?? "Não atribuído"}
                  </td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                  <td>
                    <PriorityBadge priority={order.priority} />
                  </td>
                  <td>{new Date(order.updatedAt).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
        </DataTable>
      )}

      {orders && orders.pagination.total > 0 && (
        <Pagination
          label="Paginação das ordens de serviço"
          pagination={orders.pagination}
          itemLabel="ordem(ns)"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
