import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import * as usersApi from "../api/users.ts";
import * as serviceOrdersApi from "../api/service-orders.ts";
import type { ServiceOrder, UserRecord } from "../api/types.ts";
import { PageLoading, ErrorState, EmptyState } from "../components/States.tsx";
import { StatusBadge } from "../components/Badges.tsx";

export function TechniciansListPage() {
  const [technicians, setTechnicians] = useState<UserRecord[] | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);

    try {
      const [techs, allOrders] = await Promise.all([
        usersApi.listUsers("TECHNICIAN"),
        serviceOrdersApi.listServiceOrders(),
      ]);
      setTechnicians(techs);
      setOrders(allOrders);
    } catch {
      setError("Não foi possível carregar os técnicos.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (technicians === null && !error) return <PageLoading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Técnicos</h1>
          <p className="page-subtitle">Equipe técnica e carga de trabalho atual.</p>
        </div>
      </div>

      {technicians && technicians.length === 0 && (
        <EmptyState
          title="Nenhum técnico cadastrado."
          description="Técnicos são cadastrados na página de Usuários."
        />
      )}

      {technicians && technicians.length > 0 && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {technicians.map((tech) => {
            const assigned = orders.filter((o) => o.technicianId === tech.id);
            const active = assigned.filter((o) => o.status === "OPEN" || o.status === "IN_PROGRESS");

            return (
              <div key={tech.id} className="card detail-section" style={{ marginBottom: 0 }}>
                <h2>{tech.name}</h2>
                <p className="page-subtitle" style={{ marginBottom: 12 }}>
                  {tech.email}
                </p>

                <p style={{ fontSize: 13, marginBottom: 10 }}>
                  <strong>{active.length}</strong> ordem(ns) ativa(s) de {assigned.length} atribuída(s)
                </p>

                {active.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {active.slice(0, 3).map((order) => (
                      <Link
                        key={order.id}
                        to={`/service-orders/${order.id}`}
                        style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 8 }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {order.title}
                        </span>
                        <StatusBadge status={order.status} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="field-hint">Sem ordens ativas no momento.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
