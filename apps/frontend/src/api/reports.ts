import { apiRequest } from "./client.ts";
import type { ServiceOrderPriority, ServiceOrderStatus } from "./types.ts";

export interface OperationalReportFilters {
  startDate: string;
  endDate: string;
  status?: ServiceOrderStatus;
  priority?: ServiceOrderPriority;
}

export interface OperationalReport {
  period: {
    startDate: string;
    endDate: string;
    timeZone: "America/Sao_Paulo";
    endDateInclusive: true;
  };
  filters: {
    status: ServiceOrderStatus | null;
    priority: ServiceOrderPriority | null;
  };
  currentDistribution: {
    total: number;
    byStatus: Array<{ status: ServiceOrderStatus; count: number }>;
    byPriority: Array<{ priority: ServiceOrderPriority; count: number }>;
  };
  activity: {
    createdTotal: number;
    completedTotal: number;
    daily: Array<{ date: string; created: number; completed: number }>;
  };
  workload: Array<{
    technician: { id: string; name: string } | null;
    total: number;
    byStatus: Pick<Record<ServiceOrderStatus, number>, "OPEN" | "IN_PROGRESS" | "WAITING">;
  }>;
  completionHistory: {
    source: "SERVICE_ORDER_EVENT";
    earliestRecordedCompletionAt: string | null;
    legacyCoverageLimited: true;
  };
}

export function getOperationalReport(
  filters: OperationalReportFilters,
  signal?: AbortSignal,
) {
  return apiRequest<OperationalReport>("/reports/operations", {
    query: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      status: filters.status,
      priority: filters.priority,
    },
    signal,
  });
}
