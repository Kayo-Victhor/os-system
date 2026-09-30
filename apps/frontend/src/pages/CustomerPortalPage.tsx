import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { getOwnCustomer } from "../api/customers.ts";
import { listServiceOrders } from "../api/service-orders.ts";
import type { Customer, ServiceOrder } from "../api/types.ts";
import { StatusBadge, PriorityBadge } from "../components/Badges.tsx";
import { ErrorState, PageLoading } from "../components/States.tsx";
import { useInitialAsyncLoad } from "../hooks/useInitialAsyncLoad.ts";

export function CustomerPortalPage() {
  const [customer, setCustomer] = useState<Customer | null>(null); const [orders, setOrders] = useState<ServiceOrder[]>([]); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (isActive: () => boolean = () => true, signal?: AbortSignal) => {
    try {
      setError(null);
      const [own, mine] = await Promise.all([getOwnCustomer(signal), listServiceOrders({}, signal)]);
      if (!isActive()) return;
      setCustomer(own);
      setOrders(mine);
    } catch {
      if (signal?.aborted || !isActive()) return;
      setError("Não foi possível carregar seus dados.");
    }
  }, []);
  useInitialAsyncLoad(load);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!customer) return <PageLoading label="Carregando sua área..." />;
  return <div><div className="page-header"><div><h1>Olá, {customer.name.split(" ")[0]}</h1><p className="page-subtitle">Acompanhe seus dados e ordens de serviço.</p></div></div><div className="card detail-section"><h2>Meus dados</h2><dl className="detail-grid"><div><dt>E-mail</dt><dd>{customer.email ?? "Não informado"}</dd></div><div><dt>Telefone</dt><dd>{customer.phone ?? "Não informado"}</dd></div><div><dt>Endereço</dt><dd>{customer.address ?? "Não informado"}</dd></div></dl></div><div className="card detail-section"><div className="section-heading"><div><h2>Minhas ordens de serviço</h2><p>Somente atendimentos associados ao seu cadastro.</p></div><span className="section-count">{orders.length}</span></div>{orders.length === 0 ? <p className="page-subtitle">Você ainda não possui ordens de serviço.</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Ordem</th><th>Status</th><th>Prioridade</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><Link className="row-link" to={'/service-orders/'+order.id}>{order.title}</Link></td><td><StatusBadge status={order.status} /></td><td><PriorityBadge priority={order.priority} /></td></tr>)}</tbody></table></div>}</div></div>;
}
