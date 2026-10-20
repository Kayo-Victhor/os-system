import { PageHeader, PageSection } from "../components/PageHeader.tsx";
import { Surface } from "../components/Surface.tsx";
import { MetricCard } from "../components/MetricCard.tsx";
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

  if (error) return <Surface className="portal-page">
    <ErrorState message={error} onRetry={() => void load()} />
  </Surface>;
  if (!customerAccount || orders === null) {
    return <Surface className="portal-page">
      <PageLoading label="Carregando sua área..." />
    </Surface>;
  }

  const { customer } = customerAccount;
  const activeOrders = orders.filter((order) =>
    order.status === "OPEN" || order.status === "IN_PROGRESS" || order.status === "WAITING",
  ).length;
  const completedOrders = orders.filter((order) => order.status === "COMPLETED").length;

  return (
    <div className="portal-page">
      <PageHeader
        title={"Olá, " + customer.name.split(" ")[0]}
        description="Acompanhe suas solicitações e o andamento dos atendimentos."
      />
      <Surface
        className="portal-summary"
        padded={false}
        role="region"
        aria-label="Resumo das suas ordens de serviço"
      >
        <MetricCard value={activeOrders} label="Em acompanhamento" tone="primary" />
        <MetricCard value={completedOrders} label="Concluídas" tone="success" />
        <MetricCard value={orders.length} label="Total de ordens" />
      </Surface>
      <div className="portal-columns">
        <Surface className="portal-orders-panel">
          <PageSection
            title="Minhas ordens de serviço"
            description="Abra uma ordem para consultar a descrição e o histórico do atendimento."
          >
            {orders.length === 0 ? <EmptyState
              title="Nenhuma ordem de serviço encontrada"
              description="Quando uma solicitação for registrada para o seu cadastro, ela aparecerá aqui."
            /> : <>
              <div className="portal-orders-heading" aria-hidden="true">
                <span>Ordem</span>
                <span>Status</span>
                <span>Prioridade</span>
                <span>Atualização</span>
              </div>
              <ul className="portal-orders" aria-label="Suas ordens de serviço">
                {orders.map(order => <li key={order.id}>
                  <div className="portal-order-subject">
                    <Link to={"/customer/service-orders/" + order.id}>
                      {order.title}
                    </Link>
                    <span>#{order.id.slice(0, 8)}
                    </span>
                  </div>
                  <div>
                    <StatusBadge status={order.status} />
                  </div>
                  <div>
                    <PriorityBadge priority={order.priority} />
                  </div>
                  <time dateTime={order.updatedAt} title={new Date(order.updatedAt).toLocaleString("pt-BR")}>
                    <span className="portal-mobile-date-label">Atualizada em </span>
                    {new Date(order.updatedAt).toLocaleDateString("pt-BR")}
                  </time>
                </li>)}
              </ul>
            </>}
          </PageSection>
        </Surface>
        <Surface className="portal-profile">
          <PageSection title="Meus dados" description="Informações cadastradas para o seu atendimento.">
            <dl className="portal-facts">
              <div>
                <dt>E-mail de acesso</dt>
                <dd>
                  {customerAccount.email}
                </dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>
                  {customer.phone ?? "Não informado"}
                </dd>
              </div>
              <div>
                <dt>Endereço</dt>
                <dd>
                  {customer.address ?? "Não informado"}
                </dd>
              </div>
            </dl>
          </PageSection>
        </Surface>
      </div>
    </div>
  );
}
