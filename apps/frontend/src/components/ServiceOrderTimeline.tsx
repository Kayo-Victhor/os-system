import type {
  CustomerServiceOrderEvent,
  ServiceOrderEvent,
} from "../api/types.ts";
import { PRIORITY_LABELS, STATUS_LABELS } from "../api/types.ts";

const FIELD_LABELS = {
  title: "título",
  description: "descrição",
  priority: "prioridade",
} as const;

function internalDescription(event: ServiceOrderEvent) {
  switch (event.type) {
    case "CREATED":
      return "Ordem de serviço criada";
    case "OPERATIONAL_UPDATED":
      return `Dados atualizados: ${event.changedFields.map((field) => FIELD_LABELS[field]).join(", ")}`;
    case "STATUS_CHANGED":
      return `Status alterado de ${STATUS_LABELS[event.previousStatus!]} para ${STATUS_LABELS[event.newStatus!]}`;
    case "TECHNICIAN_ASSIGNED":
      return `Técnico atribuído: ${event.newTechnician?.name ?? "Técnico removido"}`;
    case "TECHNICIAN_REASSIGNED":
      return `Técnico alterado de ${event.previousTechnician?.name ?? "Técnico removido"} para ${event.newTechnician?.name ?? "Técnico removido"}`;
    case "TECHNICIAN_UNASSIGNED":
      return `Atribuição removida de ${event.previousTechnician?.name ?? "técnico removido"}`;
  }
}

function customerDescription(event: CustomerServiceOrderEvent) {
  switch (event.type) {
    case "CREATED":
      return "Ordem de serviço criada";
    case "STATUS_CHANGED":
      return `Status alterado de ${STATUS_LABELS[event.previousStatus!]} para ${STATUS_LABELS[event.newStatus!]}`;
    case "TECHNICIAN_ASSIGNED":
    case "TECHNICIAN_REASSIGNED":
      return event.technicianName
        ? `Técnico responsável: ${event.technicianName}`
        : "Técnico responsável atualizado";
    case "TECHNICIAN_UNASSIGNED":
      return "A ordem está aguardando atribuição de técnico";
  }
}

export function InternalServiceOrderTimeline({ events }: { events: ServiceOrderEvent[] }) {
  return (
    <Timeline
      events={events.map((event) => ({
        id: event.id,
        createdAt: event.createdAt,
        description: internalDescription(event),
        detail: event.type === "OPERATIONAL_UPDATED" && event.previousPriority && event.newPriority
          ? `${PRIORITY_LABELS[event.previousPriority]} → ${PRIORITY_LABELS[event.newPriority]}`
          : event.actor?.name ? `Por ${event.actor.name}` : "Ator indisponível",
      }))}
    />
  );
}

export function CustomerServiceOrderTimeline({ events }: { events: CustomerServiceOrderEvent[] }) {
  return (
    <Timeline events={events.map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      description: customerDescription(event),
    }))} />
  );
}

function Timeline({ events }: { events: Array<{ id: string; createdAt: string; description: string; detail?: string }> }) {
  if (events.length === 0) {
    return <p className="timeline-empty">Nenhum evento registrado para esta ordem.</p>;
  }

  return (
    <ol className="timeline-list" aria-label="Histórico da ordem de serviço">
      {events.map((event) => (
        <li key={event.id} className="timeline-item">
          <span className="timeline-marker" aria-hidden="true" />
          <div>
            <strong>{event.description}</strong>
            {event.detail && <span>{event.detail}</span>}
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString("pt-BR")}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
