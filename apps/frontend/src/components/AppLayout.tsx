import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.ts";
import { ROLE_LABELS } from "../api/types.ts";
import type { Permission } from "../api/permissions.ts";
import {
  IconDashboard,
  IconOrders,
  IconCustomers,
  IconTechnician,
  IconUsersAdmin,
  IconReports,
} from "./icons.tsx";
import {
  ApplicationShell,
  type ShellNavigationGroup,
} from "./ApplicationShell.tsx";

interface NavItem {
  to: string;
  label: string;
  icon: typeof IconDashboard;
  group?: "operations" | "people" | "analytics" | "system";
  end?: boolean;
  permission?: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Painel", icon: IconDashboard, end: true },
  { to: "/service-orders", label: "Ordens de serviço", icon: IconOrders, group: "operations", permission: "OS_READ" },
  { to: "/customers", label: "Clientes", icon: IconCustomers, group: "people", permission: "CUSTOMER_READ" },
  { to: "/technicians", label: "Técnicos", icon: IconTechnician, group: "people", permission: "USER_READ" },
  { to: "/reports", label: "Relatórios", icon: IconReports, group: "analytics", permission: "REPORT_READ" },
  { to: "/users", label: "Usuários", icon: IconUsersAdmin, group: "system", permission: "USER_READ" },
];

const NAV_GROUPS = [
  { id: "operations", label: "Operações" },
  { id: "people", label: "Pessoas" },
  { id: "analytics", label: "Análises" },
  { id: "system", label: "Sistema" },
] as const;

function resolvePageTitle(pathname: string) {
  if (pathname === "/") return "Painel";
  if (pathname === "/service-orders/new") return "Nova ordem de serviço";
  if (pathname.startsWith("/service-orders/")) return "Detalhes da ordem";
  if (pathname.startsWith("/service-orders")) return "Ordens de serviço";
  if (pathname === "/customers/new") return "Novo cliente";
  if (pathname.startsWith("/customers/")) return "Detalhes do cliente";
  if (pathname.startsWith("/customers")) return "Clientes";
  if (pathname.startsWith("/technicians")) return "Técnicos";
  if (pathname === "/users/new") return "Novo usuário";
  if (pathname.startsWith("/users")) return "Usuários";
  if (pathname.startsWith("/reports")) return "Relatórios";
  return "OS System";
}

export function AppLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));
  const navigationGroups: ShellNavigationGroup[] = [
    {
      id: "main",
      items: visibleItems.filter((item) => !item.group),
    },
    ...NAV_GROUPS.flatMap(({ id, label }) => {
      const items = visibleItems.filter((item) => item.group === id);
      return items.length > 0 ? [{ id, label, items }] : [];
    }),
  ];

  return (
    <ApplicationShell
      navigationLabel="Navegação principal"
      navigationGroups={navigationGroups}
      brandSubtitle="Central de serviços"
      pageTitle={resolvePageTitle(location.pathname)}
      statusLabel="Ambiente operacional"
      connectedUserLabel="Usuário conectado"
      userLabel={ROLE_LABELS[user.role]}
      userName={user.name}
      onLogout={handleLogout}
    />
  );
}
