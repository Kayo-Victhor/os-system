import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getOwnCustomerServiceOrder, listOwnCustomerServiceOrderEvents } from "../api/customer-auth.ts";
import type { CustomerServiceOrder, CustomerServiceOrderEvent } from "../api/types.ts";
import { PriorityBadge, StatusBadge } from "../components/Badges.tsx";
import { ErrorState, PageLoading } from "../components/States.tsx";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";
import { CustomerServiceOrderTimeline } from "../components/ServiceOrderTimeline.tsx";

export function CustomerServiceOrderDetailPage() {
  const { id = "" } = useParams();
  const [order, setOrder] = useState<CustomerServiceOrder | null>(null);
  const [timeline, setTimeline] = useState<CustomerServiceOrderEvent[] | null>(null);
  const [timelineError, setTimelineError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
      try {
        setError(null);
        const result = await getOwnCustomerServiceOrder(id, signal);
        if (isActive()) setOrder(result);
        try {
          const events = await listOwnCustomerServiceOrderEvents(id, signal);
          if (isActive()) {
            setTimeline(events);
            setTimelineError(false);
          }
        } catch {
          if (isActive() && !signal?.aborted) setTimelineError(true);
        }
      } catch {
        if (signal?.aborted || !isActive()) return;
        setError("Não foi possível carregar esta ordem de serviço.");
      }
    },
    [id],
  );
  useInitialAsyncLoad(load);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return <PageLoading label="Carregando ordem de serviço..." />;

  return (
    <div className="customer-portal">
      <header className="page-header customer-portal-header customer-order-header">
        <div>
          <Link className="customer-portal-back" to="/customer/area">← Voltar para minhas ordens</Link>
          <h1>{order.title}</h1>
          <p className="page-subtitle">Ordem #{order.id.slice(0, 8)}</p>
        </div>
        <div><StatusBadge status={order.status} /> <PriorityBadge priority={order.priority} /></div>
      </header>
      <section className="card customer-portal-section">
        <h2>Descrição</h2>
        <p>{order.description}</p>
      </section>
      <section className="card customer-portal-section">
        <h2>Histórico do atendimento</h2>
        {timelineError ? (
          <p className="timeline-empty">Não foi possível carregar o histórico do atendimento.</p>
        ) : timeline === null ? (
          <p className="timeline-empty">Carregando histórico...</p>
        ) : (
          <CustomerServiceOrderTimeline events={timeline} />
        )}
      </section>
      <section className="card customer-portal-section">
        <h2>Atendimento</h2>
        <dl className="customer-service-details">
          <div><dt>Técnico responsável</dt><dd>{order.technician?.name ?? "Ainda não atribuído"}</dd></div>
          <div><dt>Criada em</dt><dd>{new Date(order.createdAt).toLocaleString("pt-BR")}</dd></div>
          <div><dt>Última atualização</dt><dd>{new Date(order.updatedAt).toLocaleString("pt-BR")}</dd></div>
        </dl>
      </section>
    </div>
  );
}
