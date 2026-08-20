import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.tsx";
import * as serviceOrdersApi from "../api/service-orders.ts";
import * as customersApi from "../api/customers.ts";
import * as usersApi from "../api/users.ts";
import type { ServiceOrder } from "../api/types.ts";
import { PageLoading, ErrorState } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";

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

    try {
      const [orders, customers, technicians] = await Promise.all([
        can("OS_READ") ? serviceOrdersApi.listServiceOrders() : Promise.resolve([]),
        can("CUSTOMER_READ") ? customersApi.listCustomers() : Promise.resolve([]),
        can("OS_READ") ? usersApi.listUsers("TECHNICIAN") : Promise.resolve([]),
      ]);

      setData({ orders, customerCount: customers.length, technicianCount: technicians.length });
    } catch {
      setError("Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoading label="Carregando painel..." />;
  if (error || !data) return <ErrorState message={error ?? "Erro desconhecido"} onRetry={load} />;

  const openOrders = data.orders.filter((o) => o.status === "OPEN").length;
  const inProgressOrders = data.orders.filter((o) => o.status === "IN_PROGRESS").length;
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
          <p className="page-subtitle">Aqui está um resumo do que está acontecendo agora.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-value">{openOrders}</div>
          <div className="stat-label">Ordens abertas</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{inProgressOrders}</div>
          <div className="stat-label">Em andamento</div>
        </div>
        <div className="card stat-card">
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
          <h2>Suas ordens em aberto ({myOrders.length})</h2>
          <OrdersMiniTable orders={myOrders} />
        </div>
      )}

      <div className="card detail-section">
        <h2>Atividade recente</h2>
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
                  {order.title}
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
