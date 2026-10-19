import { Prisma } from "../generated/prisma/client.js";
import type {
  ServiceOrderPriority,
  ServiceOrderStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import type { OperationalReportQuery } from "../schemas/report.schema.js";

export const REPORT_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_PERIOD_DAYS = 30;
const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING"] as const;
const ALL_STATUSES: ServiceOrderStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "COMPLETED",
  "CANCELLED",
];
const ALL_PRIORITIES: ServiceOrderPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

interface CountRow<T extends string> {
  key: T;
  count: number;
}

interface DailyCountRow {
  date: string;
  count: number;
}

interface WorkloadRow {
  technicianId: string | null;
  technicianName: string | null;
  status: ServiceOrderStatus;
  count: number;
}

export interface ResolvedOperationalReportFilters {
  startDate: string;
  endDate: string;
  status?: ServiceOrderStatus;
  priority?: ServiceOrderPriority;
}

function dateInTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function eachDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function resolveOperationalReportFilters(
  query: OperationalReportQuery,
  now = new Date(),
): ResolvedOperationalReportFilters {
  const endDate = query.endDate ?? dateInTimeZone(now);
  return {
    startDate: query.startDate ?? addDays(endDate, -(DEFAULT_PERIOD_DAYS - 1)),
    endDate,
    status: query.status,
    priority: query.priority,
  };
}

function currentOrderFilters(filters: ResolvedOperationalReportFilters) {
  return Prisma.sql`
    WHERE so."createdAt" >= (
      (CAST(${filters.startDate} AS date)::timestamp AT TIME ZONE ${REPORT_TIME_ZONE})
      AT TIME ZONE 'UTC'
    )
    AND so."createdAt" < (
      ((CAST(${filters.endDate} AS date) + 1)::timestamp AT TIME ZONE ${REPORT_TIME_ZONE})
      AT TIME ZONE 'UTC'
    )
    ${filters.status
      ? Prisma.sql`AND so."status" = CAST(${filters.status} AS "ServiceOrderStatus")`
      : Prisma.empty}
    ${filters.priority
      ? Prisma.sql`AND so."priority" = CAST(${filters.priority} AS "ServiceOrderPriority")`
      : Prisma.empty}
  `;
}

function completionFilters(filters: ResolvedOperationalReportFilters) {
  return Prisma.sql`
    WHERE event."type" = 'STATUS_CHANGED'::"ServiceOrderEventType"
    AND event."newStatus" = 'COMPLETED'::"ServiceOrderStatus"
    AND event."createdAt" >= (
      (CAST(${filters.startDate} AS date)::timestamp AT TIME ZONE ${REPORT_TIME_ZONE})
      AT TIME ZONE 'UTC'
    )
    AND event."createdAt" < (
      ((CAST(${filters.endDate} AS date) + 1)::timestamp AT TIME ZONE ${REPORT_TIME_ZONE})
      AT TIME ZONE 'UTC'
    )
    ${filters.status
      ? Prisma.sql`AND so."status" = CAST(${filters.status} AS "ServiceOrderStatus")`
      : Prisma.empty}
    ${filters.priority
      ? Prisma.sql`AND so."priority" = CAST(${filters.priority} AS "ServiceOrderPriority")`
      : Prisma.empty}
  `;
}

export async function getOperationalReport(filters: ResolvedOperationalReportFilters) {
  const currentFilters = currentOrderFilters(filters);
  const completedFilters = completionFilters(filters);

  const [statusRows, priorityRows, workloadRows, createdRows, completedRows, earliestCompletion] =
    await Promise.all([
      prisma.$queryRaw<CountRow<ServiceOrderStatus>[]>(Prisma.sql`
        SELECT so."status"::text AS key, COUNT(*)::integer AS count
        FROM "ServiceOrder" so
        ${currentFilters}
        GROUP BY so."status"
      `),
      prisma.$queryRaw<CountRow<ServiceOrderPriority>[]>(Prisma.sql`
        SELECT so."priority"::text AS key, COUNT(*)::integer AS count
        FROM "ServiceOrder" so
        ${currentFilters}
        GROUP BY so."priority"
      `),
      prisma.$queryRaw<WorkloadRow[]>(Prisma.sql`
        SELECT
          so."technicianId" AS "technicianId",
          technician."name" AS "technicianName",
          so."status"::text AS status,
          COUNT(*)::integer AS count
        FROM "ServiceOrder" so
        LEFT JOIN "User" technician ON technician."id" = so."technicianId"
        ${currentFilters}
        AND so."status" IN ('OPEN', 'IN_PROGRESS', 'WAITING')
        GROUP BY so."technicianId", technician."name", so."status"
        ORDER BY technician."name" ASC NULLS LAST, so."technicianId" ASC NULLS LAST
      `),
      prisma.$queryRaw<DailyCountRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(
            (so."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TIME_ZONE},
            'YYYY-MM-DD'
          ) AS date,
          COUNT(*)::integer AS count
        FROM "ServiceOrder" so
        ${currentFilters}
        GROUP BY date
        ORDER BY date ASC
      `),
      prisma.$queryRaw<DailyCountRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(
            (event."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TIME_ZONE},
            'YYYY-MM-DD'
          ) AS date,
          COUNT(DISTINCT event."serviceOrderId")::integer AS count
        FROM "ServiceOrderEvent" event
        INNER JOIN "ServiceOrder" so ON so."id" = event."serviceOrderId"
        ${completedFilters}
        GROUP BY date
        ORDER BY date ASC
      `),
      prisma.serviceOrderEvent.findFirst({
        where: { type: "STATUS_CHANGED", newStatus: "COMPLETED" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { createdAt: true },
      }),
    ]);

  const byStatus = ALL_STATUSES.map((status) => ({
    status,
    count: statusRows.find((row) => row.key === status)?.count ?? 0,
  }));
  const byPriority = ALL_PRIORITIES.map((priority) => ({
    priority,
    count: priorityRows.find((row) => row.key === priority)?.count ?? 0,
  }));
  const workload = new Map<string, {
    technician: { id: string; name: string } | null;
    total: number;
    byStatus: Record<(typeof ACTIVE_STATUSES)[number], number>;
  }>();
  for (const row of workloadRows) {
    const key = row.technicianId ?? "unassigned";
    const current = workload.get(key) ?? {
      technician: row.technicianId
        ? { id: row.technicianId, name: row.technicianName ?? "Técnico removido" }
        : null,
      total: 0,
      byStatus: { OPEN: 0, IN_PROGRESS: 0, WAITING: 0 },
    };
    if (ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
      current.total += row.count;
      current.byStatus[row.status as (typeof ACTIVE_STATUSES)[number]] = row.count;
    }
    workload.set(key, current);
  }

  const createdByDate = new Map(createdRows.map((row) => [row.date, row.count]));
  const completedByDate = new Map(completedRows.map((row) => [row.date, row.count]));
  const daily = eachDate(filters.startDate, filters.endDate).map((date) => ({
    date,
    created: createdByDate.get(date) ?? 0,
    completed: completedByDate.get(date) ?? 0,
  }));

  return {
    period: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      timeZone: REPORT_TIME_ZONE,
      endDateInclusive: true,
    },
    filters: {
      status: filters.status ?? null,
      priority: filters.priority ?? null,
    },
    currentDistribution: {
      total: byStatus.reduce((sum, item) => sum + item.count, 0),
      byStatus,
      byPriority,
    },
    activity: {
      createdTotal: daily.reduce((sum, item) => sum + item.created, 0),
      completedTotal: daily.reduce((sum, item) => sum + item.completed, 0),
      daily,
    },
    workload: [...workload.values()],
    completionHistory: {
      source: "SERVICE_ORDER_EVENT" as const,
      earliestRecordedCompletionAt: earliestCompletion?.createdAt ?? null,
      legacyCoverageLimited: true,
    },
  };
}
