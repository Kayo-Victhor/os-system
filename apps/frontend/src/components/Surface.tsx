import type { HTMLAttributes, ReactNode } from "react";

export function Surface({
  children,
  className = "",
  padded = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; padded?: boolean }) {
  return (
    <div {...props} className={`ui-surface ${padded ? "ui-surface--padded" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}
