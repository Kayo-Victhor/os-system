import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getOwnCustomerServiceOrder } from "../api/customer-auth.ts";
import type { CustomerServiceOrder } from "../api/types.ts";
import { PriorityBadge, StatusBadge } from "../components/Badges.tsx";
import { ErrorState, PageLoading } from "../components/States.tsx";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";

export function CustomerServiceOrderDetailPage() {
  const { id = "" } = useParams();
  const [order, setOrder] = useState<CustomerServiceOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
      try {
        setError(null);
        const result = await getOwnCustomerServiceOrder(id, signal);
        if (isActive()) setOrder(result);
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
    <main className="main-content">
      <div className="page-header">
        <div>
          <Link to="/customer/area">← Voltar para minhas ordens</Link>
          <h1>{order.title}</h1>
          <p className="page-subtitle">Ordem #{order.id.slice(0, 8)}</p>
        </div>
        <div><StatusBadge status={order.status} /> <PriorityBadge priority={order.priority} /></div>
      </div>
      <section className="card detail-section">
        <h2>Descrição</h2>
        <p>{order.description}</p>
      </section>
      <section className="card detail-section">
        <h2>Atendimento</h2>
        <dl className="detail-grid">
          <div><dt>Técnico responsável</dt><dd>{order.technician?.name ?? "Ainda não atribuído"}</dd></div>
          <div><dt>Criada em</dt><dd>{new Date(order.createdAt).toLocaleString("pt-BR")}</dd></div>
          <div><dt>Última atualização</dt><dd>{new Date(order.updatedAt).toLocaleString("pt-BR")}</dd></div>
        </dl>
      </section>
    </main>
  );
}
