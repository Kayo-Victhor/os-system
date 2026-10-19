import type { ReactNode } from "react";

export function PageHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        <h1 className="ui-page-header__title">{title}</h1>
        {description && <p className="ui-page-header__description">{description}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

export function PageSection({
  actions,
  children,
  description,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <section className="ui-page-section">
      {(title || actions) && (
        <header className="ui-page-section__header">
          <div>
            {title && <h2 className="ui-page-section__title">{title}</h2>}
            {description && <p className="ui-page-section__description">{description}</p>}
          </div>
          {actions && <div className="ui-page-section__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
