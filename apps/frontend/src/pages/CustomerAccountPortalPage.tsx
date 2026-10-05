import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { listOwnCustomerServiceOrders } from "../api/customer-auth.ts";
import type { CustomerServiceOrder } from "../api/types.ts";
import { PriorityBadge, StatusBadge } from "../components/Badges.tsx";
import { ErrorState, PageLoading } from "../components/States.tsx";
import { useCustomerAuth } from "../hooks/useCustomerAuth.ts";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";

export function CustomerAccountPortalPage() {
  const { customerAccount, logout } = useCustomerAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CustomerServiceOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
      try {
        setError(null);
        const result = await listOwnCustomerServiceOrders(signal);
        if (isActive()) setOrders(result);
      } catch {
        if (signal?.aborted || !isActive()) return;
        setError("Não foi possível carregar suas ordens de serviço.");
      }
    },
    [],
  );
  useInitialAsyncLoad(load);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!customerAccount || orders === null) {
    return <PageLoading label="Carregando sua área..." />;
  }

  async function signOut() {
    await logout();
    navigate("/customer/login", { replace: true });
  }

  const { customer } = customerAccount;
  return (
    <main className="main-content">
      <div className="page-header">
        <div>
          <h1>Olá, {customer.name.split(" ")[0]}</h1>
          <p className="page-subtitle">Acompanhe seus dados e atendimentos.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={signOut}>
          Sair
        </button>
      </div>

      <section className="card detail-section">
        <h2>Meus dados</h2>
        <dl className="detail-grid">
          <div><dt>E-mail de acesso</dt><dd>{customerAccount.email}</dd></div>
          <div><dt>Telefone</dt><dd>{customer.phone ?? "Não informado"}</dd></div>
          <div><dt>Endereço</dt><dd>{customer.address ?? "Não informado"}</dd></div>
        </dl>
      </section>

      <section className="card detail-section">
        <div className="section-heading">
          <div>
            <h2>Minhas ordens de serviço</h2>
            <p>Somente atendimentos associados ao seu cadastro.</p>
          </div>
          <span className="section-count">{orders.length}</span>
        </div>
        {orders.length === 0 ? (
          <p className="page-subtitle">Você ainda não possui ordens de serviço.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Ordem</th><th>Status</th><th>Prioridade</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link className="row-link" to={`/customer/service-orders/${order.id}`}>
                        {order.title}
                      </Link>
                    </td>
                    <td><StatusBadge status={order.status} /></td>
                    <td><PriorityBadge priority={order.priority} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
