import type { InputHTMLAttributes, ReactNode } from "react";

import { Surface } from "./Surface.tsx";
import { IconSearch } from "./icons.tsx";

export function FilterBar({
  actions,
  children,
  context,
  label,
}: {
  actions?: ReactNode;
  children: ReactNode;
  context?: ReactNode;
  label: string;
}) {
  return (
    <Surface className="ui-filter-bar" padded={false} role="search" aria-label={label}>
      <div className="ui-filter-bar__controls">{children}</div>
      {(context || actions) && (
        <div className="ui-filter-bar__meta">
          {context && <div className="ui-filter-bar__context">{context}</div>}
          {actions && <div className="ui-filter-bar__actions">{actions}</div>}
        </div>
      )}
    </Surface>
  );
}

export function SearchField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`ui-search-field ${className}`.trim()}>
      <IconSearch className="ui-search-field__icon" width={16} height={16} />
      <input {...props} type="search" className="input ui-search-field__input" />
    </label>
  );
}
