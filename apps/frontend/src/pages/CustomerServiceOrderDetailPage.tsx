import { ApiError } from "../api/client.ts";
import { PageHeader, PageSection } from "../components/PageHeader.tsx";
import { Surface } from "../components/Surface.tsx";
import { ButtonLink } from "../components/Button.tsx";
import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";

import { getOwnCustomerServiceOrder, listOwnCustomerServiceOrderEvents } from "../api/customer-auth.ts";
import type { CustomerServiceOrder, CustomerServiceOrderEvent } from "../api/types.ts";
import { PriorityBadge, StatusBadge } from "../components/Badges.tsx";
import { EmptyState, ErrorState, PageLoading } from "../components/States.tsx";
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
      } catch (reason) {
        if (signal?.aborted || !isActive()) return;
        setError(reason instanceof ApiError && reason.status === 404 ? "not-found" : "Não foi possível carregar esta ordem de serviço.");
      }
    },
    [id],
  );
  useInitialAsyncLoad(load);

  const backAction = <ButtonLink variant="secondary" to="/customer/area">Voltar para minhas ordens</ButtonLink>;
  if (error) return <Surface className="portal-page">
    {error === "not-found"
      ? <EmptyState
        title="A ordem não foi encontrada"
        description="Verifique o endereço ou volte para consultar suas ordens disponíveis."
        action={backAction}
      />
      : <>
        <ErrorState message={error} onRetry={() => void load()} />
        <div className="portal-state-action">
          {backAction}
        </div>
      </>}
  </Surface>;
  if (!order) return <Surface className="portal-page">
    <PageLoading label="Carregando ordem de serviço..." />
  </Surface>;

  return (
    <div className="portal-page">
      <div className="portal-back">
        {backAction}
      </div>
      <PageHeader title={order.title} description={"Ordem #" + order.id.slice(0, 8)} actions={<>
        <StatusBadge status={order.status} />
        <PriorityBadge priority={order.priority} />
      </>} />
      <div className="portal-columns portal-detail-columns">
        <div className="portal-detail-main">
          <Surface>
            <PageSection title="Descrição" description="Informações registradas na abertura da sua ordem.">
              <p className="portal-description">
                {order.description}
              </p>
            </PageSection>
          </Surface>
          <Surface className="portal-history">
            <PageSection title="Histórico do atendimento" description="Acompanhe as atualizações desta ordem de serviço.">
              {timelineError ? <p className="timeline-empty" role="alert">Não foi possível carregar o histórico do atendimento.</p> : timeline === null ? <p className="timeline-empty" role="status">Carregando histórico...</p> : <CustomerServiceOrderTimeline events={timeline} />}
            </PageSection>
          </Surface>
        </div>
        <Surface className="portal-attendance">
          <PageSection title="Atendimento">
            <dl className="portal-facts">
              <div>
                <dt>Técnico responsável</dt>
                <dd>
                  {order.technician?.name ?? "Ainda não atribuído"}
                </dd>
              </div>
              <div>
                <dt>Criada em</dt>
                <dd>
                  <time dateTime={order.createdAt}>
                    {new Date(order.createdAt).toLocaleString("pt-BR")}
                  </time>
                </dd>
              </div>
              <div>
                <dt>Última atualização</dt>
                <dd>
                  <time dateTime={order.updatedAt}>
                    {new Date(order.updatedAt).toLocaleString("pt-BR")}
                  </time>
                </dd>
              </div>
            </dl>
          </PageSection>
        </Surface>
      </div>
    </div>
  );
}
