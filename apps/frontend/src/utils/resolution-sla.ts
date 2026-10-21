import type { ResolutionSlaStatus, ServiceOrder } from "../api/types.ts";

export type ResolutionSlaData = Pick<ServiceOrder,
  "status" | "resolutionSlaMinutes" | "resolutionDueAt" | "resolutionSlaStatus"
>;

const labels: Record<ResolutionSlaStatus, string> = {
  ON_TRACK: "No prazo", DUE_SOON: "Vence em breve", BREACHED: "Atrasada",
  MET: "Concluída no prazo", CANCELLED: "Cancelada", UNTRACKED: "Sem SLA registrado",
};
const tones: Record<ResolutionSlaStatus, string> = {
  ON_TRACK: "badge-gray", DUE_SOON: "badge-amber", BREACHED: "badge-red",
  MET: "badge-green", CANCELLED: "badge-gray", UNTRACKED: "badge-gray",
};

export function formatSlaDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

export function formatSlaMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} ${hours === 1 ? "hora" : "horas"}` : "",
    rest ? `${rest} ${rest === 1 ? "minuto" : "minutos"}` : ""]
    .filter(Boolean).join(" e ") || "0 minutos";
}

export function resolutionSlaPresentation(order: ResolutionSlaData) {
  const status = order.resolutionSlaStatus;
  const valid = status && Object.hasOwn(labels, status) && status !== "UNTRACKED"
    && Number.isInteger(order.resolutionSlaMinutes) && order.resolutionSlaMinutes! > 0
    && order.resolutionDueAt && Number.isFinite(Date.parse(order.resolutionDueAt));
  // Missing/legacy data is not a new SLA classification. Never infer a status from the clock.
  const state: ResolutionSlaStatus = valid ? status : "UNTRACKED";
  return {
    state,
    label: state === "BREACHED" && order.status === "COMPLETED"
      ? "Concluída fora do prazo" : labels[state],
    tone: tones[state],
    dueAt: valid ? order.resolutionDueAt! : null,
    targetMinutes: valid ? order.resolutionSlaMinutes! : null,
  };
}

/** Snapshot estimate only; the server remains authoritative for the badge. */
export function resolutionSlaEstimate(order: ResolutionSlaData, observedAt: number): string | null {
  const { state, dueAt } = resolutionSlaPresentation(order);
  if (!dueAt || !Number.isFinite(observedAt)
    || order.status === "COMPLETED" || order.status === "CANCELLED") return null;
  const remaining = Date.parse(dueAt) - observedAt;
  const duration = Math.abs(remaining) < 60_000
    ? "menos de 1 minuto" : formatSlaMinutes(Math.floor(Math.abs(remaining) / 60_000));
  if (state === "BREACHED") return remaining < 0
    ? `Atraso estimado: ${duration}` : "Atualize a página para consultar o SLA novamente.";
  if (state === "ON_TRACK" || state === "DUE_SOON") return remaining >= 0
    ? `Tempo restante estimado: ${duration}` : "Atualize a página para consultar o SLA novamente.";
  return null;
}
