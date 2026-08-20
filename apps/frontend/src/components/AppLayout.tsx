import { useState, type ComponentType, type SVGProps } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.tsx";
import { ROLE_LABELS } from "../api/types.ts";
import type { Permission } from "../api/permissions.ts";
import {
  IconDashboard,
  IconOrders,
  IconCustomers,
  IconTechnician,
  IconUsersAdmin,
  IconLogout,
  IconMenu,
  IconClose,
} from "./icons.tsx";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
  permission?: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Painel", icon: IconDashboard, end: true },
  { to: "/service-orders", label: "Ordens de serviço", icon: IconOrders, permission: "OS_READ" },
  { to: "/customers", label: "Clientes", icon: IconCustomers, permission: "CUSTOMER_READ" },
  { to: "/technicians", label: "Técnicos", icon: IconTechnician, permission: "OS_READ" },
  { to: "/users", label: "Usuários", icon: IconUsersAdmin, permission: "USER_READ" },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="app-shell">
      <div
        className={`sidebar-backdrop ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Navegação principal">
        <div className="sidebar-brand">OS System</div>
        <nav className="sidebar-nav">
          {visibleItems.map(({ to, label, icon: ItemIcon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="sidebar-link"
              onClick={() => setMobileOpen(false)}
            >
              <ItemIcon className="sidebar-icon" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="topbar-menu-btn"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <IconClose width={20} height={20} /> : <IconMenu width={20} height={20} />}
            </button>
          </div>

          <div className="user-menu">
            <div style={{ textAlign: "right" }}>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{ROLE_LABELS[user.role]}</div>
            </div>
            <div className="user-avatar" aria-hidden="true">
              {initials(user.name)}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleLogout}
              aria-label="Sair da conta"
            >
              <IconLogout width={16} height={16} />
              Sair
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
