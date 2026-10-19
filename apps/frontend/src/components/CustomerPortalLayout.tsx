import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useCustomerAuth } from "../hooks/useCustomerAuth.ts";
import { IconClose, IconLogout, IconMenu, IconOrders } from "./icons.tsx";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function CustomerPortalLayout() {
  const { customerAccount, logout } = useCustomerAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!customerAccount) return null;

  async function handleLogout() {
    await logout();
    navigate("/customer/login", { replace: true });
  }

  const customerName = customerAccount.customer.name;

  return (
    <div className="app-shell customer-app-shell">
      <div
        className={`sidebar-backdrop ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Navegação da área do cliente">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">OS</span>
          <span><strong>OS System</strong><small>Área do cliente</small></span>
          <button
            type="button"
            className="customer-sidebar-close"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          >
            <IconClose width={20} height={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/customer/area"
            className="sidebar-link"
            onClick={() => setMobileOpen(false)}
          >
            <IconOrders className="sidebar-icon" />
            Minhas ordens
          </NavLink>
        </nav>

        <div className="sidebar-user" aria-label="Cliente conectado">
          <div className="user-avatar" aria-hidden="true">{initials(customerName)}</div>
          <div className="sidebar-user-copy"><strong>{customerName}</strong><span>Cliente</span></div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-context">
            <button
              type="button"
              className="topbar-menu-btn"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <IconClose width={20} height={20} /> : <IconMenu width={20} height={20} />}
            </button>
            <span className="topbar-title">Área do cliente</span>
          </div>

          <div className="user-menu">
            <span className="topbar-status">Acesso do cliente</span>
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

        <main className="page-content customer-page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
