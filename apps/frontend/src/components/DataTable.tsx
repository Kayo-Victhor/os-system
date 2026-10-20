import type { ReactNode, TableHTMLAttributes } from "react";

import { Surface } from "./Surface.tsx";

interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  label: string;
  framed?: boolean;
}

export function DataTable({
  children,
  className = "",
  framed = true,
  label,
  ...props
}: DataTableProps) {
  const table = (
    <div className="ui-data-table__scroll" role="region" aria-label={label} tabIndex={0}>
      <table {...props} className={`ui-data-table ${className}`.trim()}>
        {children}
      </table>
    </div>
  );

  return framed ? (
    <Surface className="ui-data-table-frame" padded={false}>{table}</Surface>
  ) : table;
}
