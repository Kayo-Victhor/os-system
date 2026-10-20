import { useLocation, useNavigate } from "react-router-dom";

import { useCustomerAuth } from "../hooks/useCustomerAuth.ts";
import { IconOrders } from "./icons.tsx";
import { ApplicationShell } from "./ApplicationShell.tsx";

export function CustomerPortalLayout() {
  const { customerAccount, logout } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!customerAccount) return null;

  async function handleLogout() {
    await logout();
    navigate("/customer/login", { replace: true });
  }

  const customerName = customerAccount.customer.name;
  const pageTitle = location.pathname === "/customer/area"
    ? "Minhas ordens"
    : "Detalhes da ordem";

  return (
    <ApplicationShell
      navigationLabel="Navegação da área do cliente"
      navigationGroups={[{
        id: "customer",
        items: [{
          to: "/customer/area",
          label: "Minhas ordens",
          icon: IconOrders,
        }],
      }]}
      brandSubtitle="Área do cliente"
      pageTitle={pageTitle}
      statusLabel="Acesso do cliente"
      connectedUserLabel="Cliente conectado"
      userLabel="Cliente"
      userName={customerName}
      onLogout={handleLogout}
      contentClassName="customer-page-content"
    />
  );
}
