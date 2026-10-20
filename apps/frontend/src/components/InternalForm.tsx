import { useEffect, useRef, type FormHTMLAttributes } from "react";

import { Button } from "./Button.tsx";

/** Shared submission layout for internal forms; validation stays with each page. */
export function InternalForm({
  busy,
  errors,
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & {
  busy: boolean;
  errors: Record<string, string>;
}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [errors]);

  return (
    <form {...props} ref={ref} className="internal-form" aria-busy={busy}>
      <fieldset className="internal-form__fields" disabled={busy}>{children}</fieldset>
    </form>
  );
}

export function FormActions({ busy, disabled, label, onCancel }: {
  busy: boolean;
  disabled?: boolean;
  label: string;
  onCancel?: () => void;
}) {
  return (
    <div className="internal-form__actions">
      {onCancel && <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>}
      <Button type="submit" loading={busy} disabled={disabled}>{busy ? "Salvando..." : label}</Button>
    </div>
  );
}
