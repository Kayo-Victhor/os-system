import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.ts";
import * as serviceOrdersApi from "../api/service-orders.ts";
import * as customersApi from "../api/customers.ts";
import { SERVICE_ORDER_STATUSES, type ServiceOrder, type ServiceOrderStatus } from "../api/types.ts";
import { PageLoading, ErrorState } from "../components/States.tsx";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";
import { PageHeader } from "../components/PageHeader.tsx";

interface DashboardData {
  orders: ServiceOrder[];
  ordersByStatus: Record<ServiceOrderStatus, number>;
  customerCount: number;
  technicianCount: number;
}

export function DashboardPage() {
  const { user, can } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const latestLoadRef = useRef(0);
  const load = useCallback(async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
    if (!isActive()) return;
    const requestId = ++latestLoadRef.current;
    const canCommit = () => isActive() && requestId === latestLoadRef.current;
    setLoading(true);
    setError(null);
    const [orderResults, auxiliaryResults] = await Promise.all([
      Promise.allSettled(SERVICE_ORDER_STATUSES.map((status) => (
        can("OS_READ")
          ? serviceOrdersApi.listServiceOrders({ status, limit: 8 }, signal)
          : Promise.resolve(null)
      ))),
      Promise.allSettled([
        can("CUSTOMER_READ") ? customersApi.listCustomers({ limit: 1 }, signal) : Promise.resolve(null),
        can("OS_ASSIGN") ? serviceOrdersApi.listAssignableTechnicians(signal) : Promise.resolve([]),
      ]),
    ]);
    const [customersResult, techniciansResult] = auxiliaryResults;
    if (!canCommit()) return;
    const failures = [...orderResults, customersResult, techniciansResult]
      .filter((result) => result.status === "rejected");
    if (failures.length === orderResults.length + 2) {
      const first = failures[0] as PromiseRejectedResult;
      setError(first.reason instanceof ApiError ? first.reason.message : "Não foi possível carregar o painel.");
      setLoading(false);
      return;
    }
    const fulfilledOrders = orderResults.flatMap((result) => (
      result.status === "fulfilled" && result.value ? result.value.items : []
    ));
    const ordersByStatus = Object.fromEntries(SERVICE_ORDER_STATUSES.map((status, index) => {
      const result = orderResults[index];
      return [status, result.status === "fulfilled" && result.value ? result.value.pagination.total : 0];
    })) as Record<ServiceOrderStatus, number>;
    setData({
      orders: fulfilledOrders,
      ordersByStatus,
      customerCount: customersResult.status === "fulfilled" && customersResult.value
        ? customersResult.value.pagination.total
        : 0,
      technicianCount: techniciansResult.status === "fulfilled" ? techniciansResult.value.length : 0,
    });
    setLoading(false);
  }, [can]);

  useInitialAsyncLoad(load);

  if (loading) return <PageLoading label="Carregando painel..." />;
  if (error || !data) return <ErrorState message={error ?? "Erro desconhecido"} onRetry={load} />;

  const openOrders = data.ordersByStatus.OPEN;
  const inProgressOrders = data.ordersByStatus.IN_PROGRESS;
  const waitingOrders = data.ordersByStatus.WAITING;
  const completedOrders = data.ordersByStatus.COMPLETED;

  const myOrders = user
    ? data.orders
      .filter((o) => o.technicianId === user.id && o.status !== "COMPLETED" && o.status !== "CANCELLED")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
    : [];
  const myOrdersTotal = user?.role === "TECHNICIAN"
    ? openOrders + inProgressOrders
    : myOrders.length;

  const recentOrders = [...data.orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title={<>Olá, {user?.name.split(" ")[0]}</>}
        description="Acompanhe a fila de atendimento e as prioridades do dia."
      />

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
        {can("OS_ASSIGN") && (
          <div className="card stat-card">
            <div className="stat-value">{data.technicianCount}</div>
            <div className="stat-label">Técnicos</div>
          </div>
        )}
      </div>

      {user?.role === "TECHNICIAN" && myOrders.length > 0 && (
        <div className="card detail-section" style={{ marginBottom: 16 }}>
          <div className="section-heading"><div><h2>Minha fila</h2><p>Ordens atribuídas que ainda precisam de acompanhamento.</p></div><span className="section-count">{myOrdersTotal}</span></div>
          <OrdersMiniTable orders={myOrders} />
        </div>
      )}

      <div className="card detail-section">
        <div className="section-heading"><div><h2>Ordens recentes</h2><p>Ordens registradas mais recentemente na central de serviços.</p></div><Link className="btn btn-secondary btn-sm" to="/service-orders">Ver todas</Link></div>
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
