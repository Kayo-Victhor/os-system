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
import { EmptyState, ErrorState, PageLoading } from "../components/States.tsx";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";
import { PageHeader, PageSection } from "../components/PageHeader.tsx";
import { MetricCard } from "../components/MetricCard.tsx";
import { FilterBar } from "../components/FilterBar.tsx";
import { Surface } from "../components/Surface.tsx";
import { Button } from "../components/Button.tsx";
import { Field } from "../components/Field.tsx";
import { DataTable } from "../components/DataTable.tsx";
import "../styles/reports.css";

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
  id, title, description, items,
}: {
  id: string;
  title: string;
  description: string;
  items: Array<{ key: string; label: string; count: number }>;
}) {
  const maximum = Math.max(...items.map((item) => item.count), 1);
  return (
    <section className="reports-distribution" aria-labelledby={id + "-title"}>
      <h3 id={id + "-title"}>
        {title}
      </h3>
      <p className="reports-description">
        {description}
      </p>
      <ul className="reports-bars">
        {items.map((item) => (
          <li key={item.key}>
            <div className="reports-bar-label">
              <span>
                {item.label}
              </span>
              <strong>
                {item.count.toLocaleString("pt-BR")}
              </strong>
            </div>
            <div className="reports-bar-track" aria-hidden="true">
              <span style={{ width: ((item.count / maximum) * 100) + "%" }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityChart({ report }: { report: OperationalReport }) {
  const maximum = Math.max(...report.activity.daily.flatMap((item) => [item.created, item.completed]), 1);
  const labelInterval = Math.max(1, Math.ceil(report.activity.daily.length / 8));
  const hasActivity = report.activity.createdTotal > 0 || report.activity.completedTotal > 0;
  return (
    <Surface className="reports-panel" role="region" aria-label="Evolução no período">
      <PageSection title="Evolução no período" description="Criações pela data da ordem; conclusões pela transição real para Concluída."
        actions={<div className="reports-legend" aria-label="Legenda do gráfico">
          <span>
            <i className="reports-series-created" aria-hidden="true" />Criadas</span>
          <span>
            <i className="reports-series-completed" aria-hidden="true" />Concluídas</span>
        </div>}>
        {!hasActivity ? <EmptyState
          title="Sem movimentação no período"
          description="Não há criações ou conclusões registradas nas datas selecionadas."
        /> : <>
          <div className="reports-plot">
            <div className="reports-chart-scale" aria-hidden="true">
              <span>
                {maximum.toLocaleString("pt-BR")}
              </span>
              <span>0</span>
            </div>
            <div
              className="reports-chart-scroll"
              tabIndex={0}
              role="region"
              aria-label="Gráfico de evolução diária, com rolagem horizontal"
            >
              <ol
                className="reports-trend"
                style={{ minWidth: report.activity.daily.length * 8 }}
                aria-label="Evolução diária de ordens criadas e concluídas"
              >
                {report.activity.daily.map((item, index) => (
                  <li className="reports-trend-day" key={item.date}
                    title={formatReportDate(item.date) + ": " + item.created + " criada(s), " + item.completed + " concluída(s)"}
                    aria-label={formatReportDate(item.date) + ": " + item.created + " criada(s), " + item.completed + " concluída(s)"}>
                    <div className="reports-trend-bars" aria-hidden="true">
                      <span className="reports-series-created" style={{ height: ((item.created / maximum) * 100) + "%" }} />
                      <span className="reports-series-completed" style={{ height: ((item.completed / maximum) * 100) + "%" }} />
                    </div>
                    <small aria-hidden="true">
                      {index % labelInterval === 0 ? formatReportDate(item.date).slice(0, 5) : ""}
                    </small>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <details className="reports-daily-data">
            <summary>Consultar valores por dia</summary>
            <DataTable label="Valores diários de criações e conclusões" framed={false}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Criadas</th>
                  <th>Concluídas</th>
                </tr>
              </thead>
              <tbody>
                {report.activity.daily.map((item) => <tr key={item.date}>
                  <th scope="row">
                    {formatReportDate(item.date)}
                  </th>
                  <td>
                    {item.created.toLocaleString("pt-BR")}
                  </td>
                  <td>
                    {item.completed.toLocaleString("pt-BR")}
                  </td>
                </tr>)}
              </tbody>
            </DataTable>
          </details>
        </>}
      </PageSection>
      <p className="reports-history-note" role="note">
        <strong>Sobre as conclusões:</strong> a série utiliza somente eventos reais de mudança para Concluída. Ordens concluídas antes da adoção do histórico podem não possuir esse evento e não são estimadas pela data de atualização.</p>
    </Surface>
  );
}

function WorkloadTable({ report }: { report: OperationalReport }) {
  return (
    <Surface className="reports-panel" role="region" aria-label="Carga atual por técnico">
      <PageSection
        title="Carga atual por técnico"
        description="Ordens ativas, criadas no período e atualmente atribuídas ou sem técnico."
      >
        {report.workload.length === 0 ? <p className="reports-description">Nenhuma ordem ativa corresponde aos filtros.</p> : (
          <DataTable label="Ordens ativas por responsável" framed={false}>
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
              {report.workload.map((item) => <tr key={item.technician?.id ?? "unassigned"}>
                <th scope="row">
                  {item.technician?.name ?? "Sem técnico atribuído"}
                </th>
                <td>
                  {item.byStatus.OPEN.toLocaleString("pt-BR")}
                </td>
                <td>
                  {item.byStatus.IN_PROGRESS.toLocaleString("pt-BR")}
                </td>
                <td>
                  {item.byStatus.WAITING.toLocaleString("pt-BR")}
                </td>
                <td>
                  <strong>
                    {item.total.toLocaleString("pt-BR")}
                  </strong>
                </td>
              </tr>)}
            </tbody>
          </DataTable>
        )}
      </PageSection>
    </Surface>
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
    <div className="reports-page">
      <PageHeader
        title="Relatórios operacionais"
        description="Analise volume, situação atual e carga da equipe sem expor dados de clientes."
      />
      <form className="reports-filters" onSubmit={applyFilters} aria-label="Filtros do relatório operacional">
        <FilterBar label="Período, status e prioridade do relatório" actions={<>
          <Button type="submit" loading={loading}>
            {loading ? "Aplicando..." : "Aplicar filtros"}
          </Button>
          <Button variant="secondary" onClick={resetFilters} disabled={loading}>Restaurar período</Button>
        </>}>
          <div className="reports-period-fields">
            <Field label="Data inicial" required>
              {(props) => <input
                {...props}
                className="input"
                type="date"
                value={draftFilters.startDate}
                onChange={(event) => setDraftFilters((current) => ({ ...current, startDate: event.target.value }))}
              />}
            </Field>
            <Field label="Data final" required error={filterError ?? undefined}>
              {(props) => <input
                {...props}
                className="input"
                type="date"
                value={draftFilters.endDate}
                onChange={(event) => setDraftFilters((current) => ({ ...current, endDate: event.target.value }))}
              />}
            </Field>
          </div>
          <Field label="Status atual">
            {(props) => <select
              {...props}
              className="input"
              value={draftFilters.status ?? ""}
              onChange={(event) => setDraftFilters((current) => ({ ...current, status: (event.target.value || undefined) as ServiceOrderStatus | undefined }))}
            >
              <option value="">Todos</option>
              {SERVICE_ORDER_STATUSES.map((status) => <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>)}
            </select>}
          </Field>
          <Field label="Prioridade atual">
            {(props) => <select
              {...props}
              className="input"
              value={draftFilters.priority ?? ""}
              onChange={(event) => setDraftFilters((current) => ({ ...current, priority: (event.target.value || undefined) as ServiceOrderPriority | undefined }))}
            >
              <option value="">Todas</option>
              {SERVICE_ORDER_PRIORITIES.map((priority) => <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>)}
            </select>}
          </Field>
        </FilterBar>
      </form>

      {loading && !report ? <PageLoading label="Carregando relatórios operacionais..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : report ? (
        <div className="reports-results" aria-busy={loading}>
          <div className="reports-period-copy">
            <p>
              Período de <strong>{formatReportDate(report.period.startDate)}</strong> a{" "}
              <strong>{formatReportDate(report.period.endDate)}</strong> · horário de Brasília
            </p>
            {loading && <span role="status">Atualizando relatório...</span>}
          </div>
          <div className="reports-summary">
            <Surface className="reports-summary-history">
              <PageSection title="Movimentação no período" description="Criações e conclusões registradas nas datas selecionadas.">
                <div className="reports-summary-values">
                  <MetricCard value={report.activity.createdTotal} label="Criadas no período" tone="primary" />
                  <MetricCard value={report.activity.completedTotal} label="Concluídas no período" tone="success" />
                </div>
              </PageSection>
            </Surface>
            <Surface className="reports-summary-current">
              <PageSection title="Situação atual" description="Entre as ordens criadas no período.">
                <MetricCard
                  value={report.workload.reduce((sum, item) => sum + item.total, 0)}
                  label="Carga ativa atual"
                  tone="warning"
                />
              </PageSection>
            </Surface>
          </div>
          {!hasResults ? <Surface className="reports-panel">
            <EmptyState
              title="Nenhuma atividade encontrada no período"
              description="Ajuste as datas ou remova filtros para consultar outros registros."
            />
          </Surface> : <>
            <ActivityChart report={report} />
            <Surface className="reports-panel">
              <PageSection
                title="Situação atual das ordens"
                description={report.currentDistribution.total.toLocaleString("pt-BR") +
                  (report.currentDistribution.total === 1 ? " ordem criada" : " ordens criadas") +
                  " no período selecionado. Status e prioridade refletem a situação atual."}
              >
                <div className="reports-distributions">
                  <MetricBars
                    id="status-report"
                    title="Ordens por status atual"
                    description="Distribuição das ordens criadas no período selecionado."
                    items={report.currentDistribution.byStatus.map(item => ({ key: item.status, label: STATUS_LABELS[item.status], count: item.count }))}
                  />
                  <MetricBars
                    id="priority-report"
                    title="Ordens por prioridade atual"
                    description="Prioridade atual das ordens criadas no período."
                    items={report.currentDistribution.byPriority.map(item => ({ key: item.priority, label: PRIORITY_LABELS[item.priority], count: item.count }))}
                  />
                </div>
              </PageSection>
            </Surface>
            <WorkloadTable report={report} />
          </>}
          {!hasResults && <p className="reports-history-note" role="note">
            <strong>Sobre as conclusões:</strong> somente eventos reais de mudança para Concluída são contabilizados. Conclusões antigas sem evento histórico não são estimadas.</p>}
        </div>
      ) : null}
    </div>
  );
}
