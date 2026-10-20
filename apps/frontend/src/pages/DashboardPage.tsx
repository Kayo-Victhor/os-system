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
import { PageHeader, PageSection } from "../components/PageHeader.tsx";
import { MetricCard } from "../components/MetricCard.tsx";
import { Surface } from "../components/Surface.tsx";
import { ButtonLink } from "../components/Button.tsx";
import { DataTable } from "../components/DataTable.tsx";

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
    <div className="operational-page dashboard-page">
      <PageHeader
        title={<>Olá, {user?.name.split(" ")[0]}</>}
        description="Acompanhe a fila de atendimento e as prioridades do dia."
      />

      <div className="dashboard-metric-groups">
        <PageSection
          title="Fluxo das ordens"
          description="Distribuição atual dos atendimentos por etapa."
        >
          <div className="metric-grid">
            <MetricCard label="Ordens abertas" value={openOrders} />
            <MetricCard label="Em andamento" value={inProgressOrders} tone="primary" />
            <MetricCard label="Aguardando" value={waitingOrders} tone="warning" />
            <MetricCard label="Concluídas" value={completedOrders} tone="success" />
          </div>
        </PageSection>

        {(can("CUSTOMER_READ") || can("OS_ASSIGN")) && (
          <PageSection
            title="Base operacional"
            description="Cadastros disponíveis para o atendimento."
          >
            <div className="metric-grid metric-grid--support">
              {can("CUSTOMER_READ") && (
                <MetricCard label="Clientes cadastrados" value={data.customerCount} />
              )}
              {can("OS_ASSIGN") && (
                <MetricCard label="Técnicos" value={data.technicianCount} />
              )}
            </div>
          </PageSection>
        )}
      </div>

      {user?.role === "TECHNICIAN" && myOrders.length > 0 && (
        <Surface className="dashboard-list-section">
          <PageSection
            title="Minha fila"
            description="Ordens atribuídas que ainda precisam de acompanhamento."
            actions={<span className="section-count">{myOrdersTotal}</span>}
          >
            <OrdersMiniTable orders={myOrders} label="Ordens da minha fila" />
          </PageSection>
        </Surface>
      )}

      <Surface className="dashboard-list-section">
        <PageSection
          title="Ordens recentes"
          description="Ordens registradas mais recentemente na central de serviços."
          actions={<ButtonLink to="/service-orders" variant="secondary" size="sm">Ver todas</ButtonLink>}
        >
          {recentOrders.length === 0 ? (
            <p className="dashboard-empty-copy">Nenhuma ordem de serviço registrada ainda.</p>
          ) : (
            <OrdersMiniTable orders={recentOrders} label="Ordens recentes" />
          )}
        </PageSection>
      </Surface>
    </div>
  );
}

function OrdersMiniTable({ orders, label }: { orders: ServiceOrder[]; label: string }) {
  return (
    <DataTable label={label} framed={false}>
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
    </DataTable>
  );
}
