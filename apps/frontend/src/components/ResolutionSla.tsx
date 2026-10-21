import { useState } from "react";
import { PageSection } from "./PageHeader.tsx";
import { formatSlaDate, formatSlaMinutes, resolutionSlaEstimate, resolutionSlaPresentation,
  type ResolutionSlaData } from "../utils/resolution-sla.ts";
import "./resolution-sla.css";

export function ResolutionSlaIndicator({ order }: { order: ResolutionSlaData }) {
  const sla = resolutionSlaPresentation(order);
  return (
    <div className="resolution-sla" aria-label="SLA de resolução">
      <span className={`badge ${sla.tone}`}>{sla.label}</span>
      {sla.dueAt && <time className="resolution-sla__due" dateTime={sla.dueAt} aria-label={`Vencimento: ${formatSlaDate(sla.dueAt)}`}>
        {formatSlaDate(sla.dueAt)}
      </time>}
    </div>
  );
}

export function ResolutionSlaDetails({ order }: { order: ResolutionSlaData }) {
  const [observedAt] = useState(() => Date.now());
  const sla = resolutionSlaPresentation(order);
  const estimate = resolutionSlaEstimate(order, observedAt);
  return (
    <PageSection title="SLA de resolução">
      <ResolutionSlaIndicator order={order} />
      {sla.targetMinutes !== null && <dl className="internal-facts internal-facts--single resolution-sla__facts">
        <div><dt>Meta de resolução</dt><dd>{formatSlaMinutes(sla.targetMinutes)}</dd></div>
      </dl>}
      {sla.state === "UNTRACKED" && <p className="resolution-sla__note">Esta ordem não possui monitoramento de SLA disponível.</p>}
      {estimate && <>
        <p className="resolution-sla__estimate">{estimate}</p>
        <p className="resolution-sla__note">Estimativa na abertura desta seção. Recarregue a página para atualizar.</p>
      </>}
    </PageSection>
  );
}
