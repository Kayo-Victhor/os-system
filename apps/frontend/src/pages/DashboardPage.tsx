import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.tsx";
import * as serviceOrdersApi from "../api/service-orders.ts";
import * as customersApi from "../api/customers.ts";
import * as usersApi from "../api/users.ts";
import type { ServiceOrder } from "../api/types.ts";
import { PageLoading, ErrorState } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";

interface DashboardData {
  orders: ServiceOrder[];
  customerCount: number;
  technicianCount: number;
}

export function DashboardPage() {
  const { user, can } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [ordersResult, customersResult, techniciansResult] = await Promise.allSettled([
      can("OS_READ") ? serviceOrdersApi.listServiceOrders() : Promise.resolve([]),
      can("CUSTOMER_READ") ? customersApi.listCustomers() : Promise.resolve([]),
      can("OS_READ") ? usersApi.listUsers("TECHNICIAN") : Promise.resolve([]),
    ]);

    // Any one of these three widgets can fail independently (e.g. a
    // transient error fetching orders shouldn't hide the customer count).
    // We only show the full-page error state if every source failed —
    // otherwise render with whatever succeeded and fall back to empty
    // arrays for the rest, same as "no data yet".
    const failures = [ordersResult, customersResult, techniciansResult].filter(
      (r) => r.status === "rejected",
    );

    if (failures.length === 3) {
      const first = failures[0] as PromiseRejectedResult;
      setError(
        first.reason instanceof ApiError
          ? first.reason.message
          : "Não foi possível carregar o painel.",
      );
      setLoading(false);
      return;
    }

    setData({
      orders: ordersResult.status === "fulfilled" ? ordersResult.value : [],
      customerCount: customersResult.status === "fulfilled" ? customersResult.value.length : 0,
      technicianCount: techniciansResult.status === "fulfilled" ? techniciansResult.value.length : 0,
    });
    setLoading(false);
  }, [can]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoading label="Carregando painel..." />;
  if (error || !data) return <ErrorState message={error ?? "Erro desconhecido"} onRetry={load} />;

  const openOrders = data.orders.filter((o) => o.status === "OPEN").length;
  const inProgressOrders = data.orders.filter((o) => o.status === "IN_PROGRESS").length;
  const waitingOrders = data.orders.filter((o) => o.status === "WAITING").length;
  const completedOrders = data.orders.filter((o) => o.status === "COMPLETED").length;

  const myOrders = user
    ? data.orders.filter((o) => o.technicianId === user.id && o.status !== "COMPLETED" && o.status !== "CANCELLED")
    : [];

  const recentOrders = [...data.orders]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Olá, {user?.name.split(" ")[0]}</h1>
          <p className="page-subtitle">Acompanhe a fila de atendimento e as prioridades do dia.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat-card stat-card-open">
          <div className="stat-value">{openOrders}</div>
          <div className="stat-label">Ordens abertas</div>
        </div>
        <div className="card stat-card stat-card-progress">
          <div className="stat-value">{inProgressOrders}</div>
          <div className="stat-label">Em andamento</div>
        </div>
        <div className="card stat-card stat-card-waiting">
          <div className="stat-value">{waitingOrders}</div>
          <div className="stat-label">Aguardando</div>
        </div>
        <div className="card stat-card stat-card-completed">
          <div className="stat-value">{completedOrders}</div>
          <div className="stat-label">Concluídas</div>
        </div>
        {can("CUSTOMER_READ") && (
          <div className="card stat-card">
            <div className="stat-value">{data.customerCount}</div>
            <div className="stat-label">Clientes cadastrados</div>
          </div>
        )}
        <div className="card stat-card">
          <div className="stat-value">{data.technicianCount}</div>
          <div className="stat-label">Técnicos</div>
        </div>
      </div>

      {user?.role === "TECHNICIAN" && myOrders.length > 0 && (
        <div className="card detail-section" style={{ marginBottom: 16 }}>
          <div className="section-heading"><div><h2>Minha fila</h2><p>Ordens atribuídas que ainda precisam de acompanhamento.</p></div><span className="section-count">{myOrders.length}</span></div>
          <OrdersMiniTable orders={myOrders} />
        </div>
      )}

      <div className="card detail-section">
        <div className="section-heading"><div><h2>Ordens recentes</h2><p>Atualizações mais recentes na central de serviços.</p></div><Link className="btn btn-secondary btn-sm" to="/service-orders">Ver todas</Link></div>
        {recentOrders.length === 0 ? (
          <p className="page-subtitle">Nenhuma ordem de serviço registrada ainda.</p>
        ) : (
          <OrdersMiniTable orders={recentOrders} />
        )}
      </div>
    </div>
  );
}

function OrdersMiniTable({ orders }: { orders: ServiceOrder[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Ordem</th>
            <th>Cliente</th>
            <th>Status</th>
            <th>Prioridade</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link to={`/service-orders/${order.id}`} className="row-link">
                  <span className="order-title">{order.title}</span>
                  <span className="order-reference">#{order.id.slice(-6).toUpperCase()}</span>
                </Link>
              </td>
              <td>{order.customer.name}</td>
              <td>
                <StatusBadge status={order.status} />
              </td>
              <td>
                <PriorityBadge priority={order.priority} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
