import { useCallback, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../api/client.ts";
import * as reportsApi from "../api/reports.ts";
import type { OperationalReport, OperationalReportFilters } from "../api/reports.ts";
import {
  PRIORITY_LABELS,
  SERVICE_ORDER_PRIORITIES,
  SERVICE_ORDER_STATUSES,
  STATUS_LABELS,
  type ServiceOrderPriority,
  type ServiceOrderStatus,
} from "../api/types.ts";
import { EmptyState, ErrorBanner, ErrorState, PageLoading } from "../components/States.tsx";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";

const REPORT_TIME_ZONE = "America/Sao_Paulo";

function dateInReportTimeZone(date: Date) {
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

function defaultFilters(): OperationalReportFilters {
  const endDate = dateInReportTimeZone(new Date());
  return { startDate: addDays(endDate, -29), endDate };
}

function formatReportDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function MetricBars({
  id,
  title,
  description,
  items,
}: {
  id: string;
  title: string;
  description: string;
  items: Array<{ key: string; label: string; count: number }>;
}) {
  const maximum = Math.max(...items.map((item) => item.count), 1);
  return (
    <section className="card report-card" aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <ul className="report-bars">
        {items.map((item) => (
          <li key={item.key}>
            <div className="report-bar-label">
              <span>{item.label}</span>
              <strong>{item.count.toLocaleString("pt-BR")}</strong>
            </div>
            <div className="report-bar-track" aria-hidden="true">
              <span style={{ width: `${(item.count / maximum) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityChart({ report }: { report: OperationalReport }) {
  const maximum = Math.max(
    ...report.activity.daily.flatMap((item) => [item.created, item.completed]),
    1,
  );
  const labelInterval = Math.max(1, Math.ceil(report.activity.daily.length / 8));

  return (
    <section className="card report-card report-activity" aria-labelledby="activity-title">
      <div className="section-heading">
        <div>
          <h2 id="activity-title">Evolução no período</h2>
          <p>Criações pela data da ordem; conclusões pela transição real para Concluída.</p>
        </div>
        <div className="report-legend" aria-label="Legenda do gráfico">
          <span><i className="created" />Criadas</span>
          <span><i className="completed" />Concluídas</span>
        </div>
      </div>
      <div className="report-trend-scroll">
        <ol
          className="report-trend"
          aria-label="Evolução diária de ordens criadas e concluídas"
        >
          {report.activity.daily.map((item, index) => (
            <li
              className="report-trend-day"
              key={item.date}
              aria-label={`${formatReportDate(item.date)}: ${item.created} criada(s), ${item.completed} concluída(s)`}
            >
              <div className="report-trend-bars" aria-hidden="true">
                <span
                  className="created"
                  style={{ height: item.created ? `${(item.created / maximum) * 100}%` : 0 }}
                />
                <span
                  className="completed"
                  style={{ height: item.completed ? `${(item.completed / maximum) * 100}%` : 0 }}
                />
              </div>
              <small>{index % labelInterval === 0 ? item.date.slice(5) : ""}</small>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function WorkloadTable({ report }: { report: OperationalReport }) {
  return (
    <section className="card report-card" aria-labelledby="workload-title">
      <div className="section-heading">
        <div>
          <h2 id="workload-title">Carga atual por técnico</h2>
          <p>Ordens ativas, criadas no período e atualmente atribuídas ou sem técnico.</p>
        </div>
      </div>
      {report.workload.length === 0 ? (
        <p className="report-empty-copy">Nenhuma ordem ativa corresponde aos filtros.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Técnico</th>
                <th>Aberta</th>
                <th>Em andamento</th>
                <th>Aguardando</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {report.workload.map((item) => (
                <tr key={item.technician?.id ?? "unassigned"}>
                  <td>{item.technician?.name ?? "Sem técnico atribuído"}</td>
                  <td>{item.byStatus.OPEN}</td>
                  <td>{item.byStatus.IN_PROGRESS}</td>
                  <td>{item.byStatus.WAITING}</td>
                  <td><strong>{item.total}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ReportsPage() {
  const [draftFilters, setDraftFilters] = useState<OperationalReportFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<OperationalReportFilters>(defaultFilters);
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const latestLoadRef = useRef(0);
  const {
    startDate: appliedStartDate,
    endDate: appliedEndDate,
    status: appliedStatus,
    priority: appliedPriority,
  } = appliedFilters;

  const load = useCallback(async (
    isActive: () => boolean = () => true,
    signal?: AbortSignal,
  ) => {
    const requestId = ++latestLoadRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await reportsApi.getOperationalReport({
        startDate: appliedStartDate,
        endDate: appliedEndDate,
        status: appliedStatus,
        priority: appliedPriority,
      }, signal);
      if (!isActive() || requestId !== latestLoadRef.current) return;
      setReport(data);
    } catch (loadError) {
      if (!isActive() || requestId !== latestLoadRef.current) return;
      setError(loadError instanceof ApiError ? loadError.message : "Não foi possível carregar os relatórios.");
    } finally {
      if (isActive() && requestId === latestLoadRef.current) setLoading(false);
    }
  }, [
    appliedEndDate,
    appliedPriority,
    appliedStartDate,
    appliedStatus,
  ]);

  useInitialAsyncLoad(load);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (draftFilters.startDate > draftFilters.endDate) {
      setFilterError("A data final deve ser igual ou posterior à data inicial.");
      return;
    }
    setFilterError(null);
    setAppliedFilters({ ...draftFilters });
  }

  function resetFilters() {
    const defaults = defaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setFilterError(null);
  }

  const hasResults = Boolean(
    report && (
      report.currentDistribution.total > 0 ||
      report.activity.createdTotal > 0 ||
      report.activity.completedTotal > 0
    ),
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Relatórios operacionais</h1>
          <p className="page-subtitle">
            Analise volume, situação atual e carga da equipe sem expor dados de clientes.
          </p>
        </div>
      </div>

      <form className="card report-filters" onSubmit={applyFilters}>
        <div className="field">
          <label htmlFor="report-start-date">Data inicial</label>
          <input
            id="report-start-date"
            className="input"
            type="date"
            required
            value={draftFilters.startDate}
            onChange={(event) => setDraftFilters((current) => ({
              ...current,
              startDate: event.target.value,
            }))}
          />
        </div>
        <div className="field">
          <label htmlFor="report-end-date">Data final</label>
          <input
            id="report-end-date"
            className="input"
            type="date"
            required
            value={draftFilters.endDate}
            onChange={(event) => setDraftFilters((current) => ({
              ...current,
              endDate: event.target.value,
            }))}
          />
        </div>
        <div className="field">
          <label htmlFor="report-status">Status atual</label>
          <select
            id="report-status"
            className="input"
            value={draftFilters.status ?? ""}
            onChange={(event) => setDraftFilters((current) => ({
              ...current,
              status: (event.target.value || undefined) as ServiceOrderStatus | undefined,
            }))}
          >
            <option value="">Todos</option>
            {SERVICE_ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-priority">Prioridade atual</label>
          <select
            id="report-priority"
            className="input"
            value={draftFilters.priority ?? ""}
            onChange={(event) => setDraftFilters((current) => ({
              ...current,
              priority: (event.target.value || undefined) as ServiceOrderPriority | undefined,
            }))}
          >
            <option value="">Todas</option>
            {SERVICE_ORDER_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>
            ))}
          </select>
        </div>
        <div className="report-filter-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Aplicando..." : "Aplicar filtros"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={resetFilters} disabled={loading}>
            Restaurar período
          </button>
        </div>
        {filterError && <div className="report-filter-error"><ErrorBanner message={filterError} /></div>}
      </form>

      {loading && !report ? (
        <PageLoading label="Carregando relatórios operacionais..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : report ? (
        <>
          <div className="report-period-copy">
            Período de <strong>{formatReportDate(report.period.startDate)}</strong> a{" "}
            <strong>{formatReportDate(report.period.endDate)}</strong> · horário de Brasília
          </div>

          <div className="stat-grid report-stats">
            <div className="card stat-card">
              <div className="stat-value">{report.activity.createdTotal}</div>
              <div className="stat-label">Criadas no período</div>
            </div>
            <div className="card stat-card stat-card-completed">
              <div className="stat-value">{report.activity.completedTotal}</div>
              <div className="stat-label">Concluídas no período</div>
            </div>
            <div className="card stat-card stat-card-progress">
              <div className="stat-value">{report.currentDistribution.total}</div>
              <div className="stat-label">Ordens criadas no período</div>
            </div>
            <div className="card stat-card stat-card-waiting">
              <div className="stat-value">
                {report.workload.reduce((sum, item) => sum + item.total, 0)}
              </div>
              <div className="stat-label">Carga ativa atual</div>
            </div>
          </div>

          {!hasResults && (
            <div className="card report-empty">
              <EmptyState
                title="Nenhuma atividade encontrada no período"
                description="Ajuste as datas ou remova filtros para consultar outros registros."
              />
            </div>
          )}

          <div className="report-grid">
            <MetricBars
              id="status-report"
              title="Ordens por status atual"
              description="Distribuição das ordens criadas no período selecionado."
              items={report.currentDistribution.byStatus.map((item) => ({
                key: item.status,
                label: STATUS_LABELS[item.status],
                count: item.count,
              }))}
            />
            <MetricBars
              id="priority-report"
              title="Ordens por prioridade atual"
              description="Prioridade atual das ordens criadas no período."
              items={report.currentDistribution.byPriority.map((item) => ({
                key: item.priority,
                label: PRIORITY_LABELS[item.priority],
                count: item.count,
              }))}
            />
          </div>

          <ActivityChart report={report} />
          <WorkloadTable report={report} />

          <div className="report-caveat" role="note">
            <strong>Sobre as conclusões:</strong>{" "}
            a série utiliza somente eventos reais de mudança para Concluída. Ordens concluídas antes
            da adoção do histórico podem não possuir esse evento e não são estimadas por
            <code> updatedAt</code>.
          </div>
        </>
      ) : null}
    </div>
  );
}
