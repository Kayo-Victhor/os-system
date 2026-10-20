import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";

import * as usersApi from "../api/users.ts";
import * as serviceOrdersApi from "../api/service-orders.ts";
import type { ServiceOrder, UserRecord } from "../api/types.ts";
import { PageLoading, ErrorState, EmptyState } from "../components/States.tsx";
import { RoleBadge, StatusBadge } from "../components/Badges.tsx";
import { ApiError } from "../api/client.ts";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { Surface } from "../components/Surface.tsx";

export function TechniciansListPage() {
  const [technicians, setTechnicians] = useState<UserRecord[] | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const latestLoadRef = useRef(0);
  const load = useCallback(async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
    if (!isActive()) return;
    const requestId = ++latestLoadRef.current;
    const canCommit = () => isActive() && requestId === latestLoadRef.current;
    setError(null);
    const [techResult, ordersResult] = await Promise.allSettled([
      usersApi.listUsers("TECHNICIAN", signal),
      serviceOrdersApi.listAllServiceOrders({}, signal),
    ]);
    if (!canCommit()) return;
    if (techResult.status === "fulfilled") setTechnicians(techResult.value);
    else { setError(techResult.reason instanceof ApiError ? techResult.reason.message : "Não foi possível carregar os técnicos."); return; }
    if (ordersResult.status === "fulfilled") setOrders(ordersResult.value);
  }, []);

  useInitialAsyncLoad(load);

  return (
    <div className="operational-page">
      <PageHeader
        title="Técnicos"
        description="Equipe técnica e carga de trabalho atual."
      />

      {technicians === null && !error && <PageLoading label="Carregando técnicos..." />}
      {error && <ErrorState message={error} onRetry={load} />}

      {technicians && technicians.length === 0 && (
        <EmptyState
          title="Nenhum técnico cadastrado."
          description="Técnicos são cadastrados na página de Usuários."
        />
      )}

      {technicians && technicians.length > 0 && (
        <div className="technician-grid">
          {technicians.map((tech) => {
            const assigned = orders.filter((o) => o.technicianId === tech.id);
            const active = assigned.filter((o) => o.status === "OPEN" || o.status === "IN_PROGRESS");

            return (
              <Surface key={tech.id} className="technician-card">
                <div className="technician-card__header">
                  <div>
                    <h2>{tech.name}</h2>
                    <p>{tech.email}</p>
                  </div>
                  <RoleBadge role={tech.role} />
                </div>

                <dl className="technician-workload" aria-label={`Carga de trabalho de ${tech.name}`}>
                  <div><dt>Ativas</dt><dd>{active.length}</dd></div>
                  <div><dt>Atribuídas</dt><dd>{assigned.length}</dd></div>
                </dl>

                {active.length > 0 ? (
                  <div className="technician-orders" aria-label={`Ordens ativas de ${tech.name}`}>
                    {active.slice(0, 3).map((order) => (
                      <Link
                        key={order.id}
                        to={`/service-orders/${order.id}`}
                        className="technician-order-link"
                      >
                        <span>{order.title}</span>
                        <StatusBadge status={order.status} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="technician-card__empty">Sem ordens ativas no momento.</p>
                )}
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
