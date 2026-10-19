import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import { listOwnCustomerServiceOrders } from "../api/customer-auth.ts";
import type { CustomerServiceOrder } from "../api/types.ts";
import { PriorityBadge, StatusBadge } from "../components/Badges.tsx";
import { EmptyState, ErrorState, PageLoading } from "../components/States.tsx";
import { useCustomerAuth } from "../hooks/useCustomerAuth.ts";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";

export function CustomerAccountPortalPage() {
  const { customerAccount } = useCustomerAuth();
  const [orders, setOrders] = useState<CustomerServiceOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
      try {
        setError(null);
        const result = await listOwnCustomerServiceOrders(signal);
        if (isActive()) setOrders(result);
      } catch {
        if (signal?.aborted || !isActive()) return;
        setError("Não foi possível carregar suas ordens de serviço.");
      }
    },
    [],
  );
  useInitialAsyncLoad(load);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!customerAccount || orders === null) {
    return <PageLoading label="Carregando sua área..." />;
  }

  const { customer } = customerAccount;
  const activeOrders = orders.filter((order) =>
    order.status === "OPEN" || order.status === "IN_PROGRESS" || order.status === "WAITING",
  ).length;
  const completedOrders = orders.filter((order) => order.status === "COMPLETED").length;

  return (
    <div className="customer-portal">
      <header className="page-header customer-portal-header">
        <div>
          <h1>Olá, {customer.name.split(" ")[0]}</h1>
          <p className="page-subtitle">Acompanhe suas solicitações e o andamento dos atendimentos.</p>
        </div>
      </header>

      <section className="stat-grid customer-stat-grid" aria-label="Resumo das suas ordens de serviço">
        <div className="card stat-card stat-card-progress">
          <strong className="stat-value">{activeOrders}</strong>
          <span className="stat-label">Em acompanhamento</span>
        </div>
        <div className="card stat-card stat-card-completed">
          <strong className="stat-value">{completedOrders}</strong>
          <span className="stat-label">Concluídas</span>
        </div>
        <div className="card stat-card stat-card-open">
          <strong className="stat-value">{orders.length}</strong>
          <span className="stat-label">Total de ordens</span>
        </div>
      </section>

      <section className="card customer-portal-section customer-profile-section" aria-labelledby="customer-profile-title">
        <div className="section-heading">
          <div>
            <h2 id="customer-profile-title">Meus dados</h2>
            <p>Informações cadastradas para o seu atendimento.</p>
          </div>
        </div>
        <dl className="customer-profile-grid">
          <div><dt>E-mail de acesso</dt><dd>{customerAccount.email}</dd></div>
          <div><dt>Telefone</dt><dd>{customer.phone ?? "Não informado"}</dd></div>
          <div><dt>Endereço</dt><dd>{customer.address ?? "Não informado"}</dd></div>
        </dl>
      </section>

      <section className="card customer-portal-section" aria-labelledby="customer-orders-title">
        <div className="section-heading">
          <div>
            <h2 id="customer-orders-title">Minhas ordens de serviço</h2>
            <p>Somente atendimentos associados ao seu cadastro.</p>
          </div>
          <span className="section-count">{orders.length}</span>
        </div>
        {orders.length === 0 ? (
          <EmptyState
            title="Nenhuma ordem de serviço encontrada"
            description="Quando uma solicitação for registrada para o seu cadastro, ela aparecerá aqui."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Ordem</th><th>Status</th><th>Prioridade</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link className="row-link" to={`/customer/service-orders/${order.id}`}>
                        {order.title}
                      </Link>
                    </td>
                    <td><StatusBadge status={order.status} /></td>
                    <td><PriorityBadge priority={order.priority} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
