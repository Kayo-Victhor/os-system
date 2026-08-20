import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import * as serviceOrdersApi from "../api/service-orders.ts";
import type { ServiceOrder, ServiceOrderPriority, ServiceOrderStatus } from "../api/types.ts";
import { SERVICE_ORDER_STATUSES, SERVICE_ORDER_PRIORITIES, STATUS_LABELS, PRIORITY_LABELS } from "../api/types.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { PageLoading, ErrorState, EmptyState } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { IconPlus, IconSearch } from "../components/icons.tsx";

export function ServiceOrdersListPage() {
  const { can, user } = useAuth();
  const [orders, setOrders] = useState<ServiceOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ServiceOrderStatus | "">("");
  const [priority, setPriority] = useState<ServiceOrderPriority | "">("");
  const [onlyMine, setOnlyMine] = useState(user?.role === "TECHNICIAN");

  const load = useCallback(async () => {
    setError(null);

    try {
      const data = await serviceOrdersApi.listServiceOrders({
        status: status || undefined,
        priority: priority || undefined,
        search: search.trim() || undefined,
        technicianId: onlyMine && user ? user.id : undefined,
      });

      setOrders(data);
    } catch {
      setError("Não foi possível carregar as ordens de serviço.");
    }
  }, [status, priority, onlyMine, search, user]);

  useEffect(() => {
    const timeout = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [load, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ordens de serviço</h1>
          <p className="page-subtitle">Acompanhe e gerencie as ordens de serviço.</p>
        </div>
        {can("OS_CREATE") && (
          <Link to="/service-orders/new" className="btn btn-primary">
            <IconPlus width={16} height={16} />
            Nova ordem
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
            placeholder="Buscar por título ou descrição"
            style={{ paddingLeft: 30 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar ordens de serviço"
          />
        </div>

        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as ServiceOrderStatus | "")}
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
          className="input"
          value={priority}
          onChange={(e) => setPriority(e.target.value as ServiceOrderPriority | "")}
          aria-label="Filtrar por prioridade"
        >
          <option value="">Todas as prioridades</option>
          {SERVICE_ORDER_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>

        {user?.role === "TECHNICIAN" && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Apenas minhas ordens
          </label>
        )}
      </div>

      {orders === null && !error && <PageLoading />}
      {error && <ErrorState message={error} onRetry={load} />}

      {orders && orders.length === 0 && (
        <EmptyState
          title="Não há ordens de serviço cadastradas."
          description={
            search || status || priority
              ? "Nenhuma ordem corresponde aos filtros selecionados."
              : "Quando uma ordem for criada, ela aparecerá aqui."
          }
        />
      )}

      {orders && orders.length > 0 && (
        <div className="card table-wrap">
          <table className="data-table">
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
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="wrap">
                    <Link to={`/service-orders/${order.id}`} className="row-link">
                      {order.title}
                    </Link>
                  </td>
                  <td>{order.customer.name}</td>
                  <td>{order.technician?.name ?? "Não atribuído"}</td>
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
          </table>
        </div>
      )}
    </div>
  );
}
