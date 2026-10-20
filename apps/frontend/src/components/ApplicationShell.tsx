import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { NavLink, Outlet } from "react-router-dom";

import { Button } from "./Button.tsx";
import { IconClose, IconLogout, IconMenu } from "./icons.tsx";

export interface ShellNavigationItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
}

export interface ShellNavigationGroup {
  id: string;
  label?: string;
  items: ShellNavigationItem[];
}

interface ApplicationShellProps {
  navigationLabel: string;
  navigationGroups: ShellNavigationGroup[];
  brandSubtitle: string;
  pageTitle: string;
  statusLabel: string;
  connectedUserLabel: string;
  userLabel: string;
  userName: string;
  onLogout: () => Promise<void>;
  contentClassName?: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ApplicationShell({
  navigationLabel,
  navigationGroups,
  brandSubtitle,
  pageTitle,
  statusLabel,
  connectedUserLabel,
  userLabel,
  userName,
  onLogout,
  contentClassName = "",
}: ApplicationShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseButtonRef = useRef<HTMLButtonElement>(null);
  const navigationId = "application-navigation";

  function closeMobileNavigation(restoreFocus = false) {
    setMobileOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  }

  useEffect(() => {
    if (!mobileOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      sidebarCloseButtonRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMobileNavigation(true);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <button
        type="button"
        className={`sidebar-backdrop ${mobileOpen ? "open" : ""}`}
        aria-label="Fechar navegação"
        onClick={() => closeMobileNavigation(true)}
      />

      <aside
        id={navigationId}
        className={`sidebar ${mobileOpen ? "open" : ""}`}
        aria-label={navigationLabel}
      >
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">OS</span>
          <span className="sidebar-brand-copy">
            <strong>OS System</strong>
            <small>{brandSubtitle}</small>
          </span>
          <button
            ref={sidebarCloseButtonRef}
            type="button"
            className="sidebar-close"
            aria-label="Fechar menu"
            onClick={() => closeMobileNavigation(true)}
          >
            <IconClose width={20} height={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navigationGroups.map((group) => (
            <div className="sidebar-group" key={group.id}>
              {group.label && <p className="sidebar-group-label">{group.label}</p>}
              {group.items.map(({ to, label, icon: ItemIcon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className="sidebar-link"
                  onClick={() => closeMobileNavigation()}
                >
                  <ItemIcon className="sidebar-icon" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-user" aria-label={connectedUserLabel}>
          <div className="user-avatar" aria-hidden="true">{initials(userName)}</div>
          <div className="sidebar-user-copy">
            <strong>{userName}</strong>
            <span>{userLabel}</span>
          </div>
        </div>
      </aside>

      <div className="main-area" inert={mobileOpen}>
        <header className="topbar">
          <div className="topbar-context">
            <button
              ref={menuButtonRef}
              type="button"
              className="topbar-menu-btn"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              aria-controls={navigationId}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <IconClose width={20} height={20} /> : <IconMenu width={20} height={20} />}
            </button>
            <span className="topbar-title">{pageTitle}</span>
          </div>

          <div className="user-menu">
            <span className="topbar-status">{statusLabel}</span>
            <Button
              variant="neutral"
              size="sm"
              className="shell-logout"
              onClick={handleLogout}
              loading={loggingOut}
              aria-label="Sair da conta"
            >
              {!loggingOut && <IconLogout width={16} height={16} />}
              {loggingOut ? "Saindo..." : "Sair"}
            </Button>
          </div>
        </header>

        <main className={`page-content ${contentClassName}`.trim()}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
