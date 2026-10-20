import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type ButtonVariant = "primary" | "secondary" | "neutral" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
}

interface ButtonLinkProps extends LinkProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

function buttonClassName(variant: ButtonVariant, size: "sm" | "md", className = "") {
  return `ui-button ui-button--${variant} ${size === "sm" ? "ui-button--sm" : ""} ${className}`.trim();
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  children,
  className = "",
  disabled,
  loading,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={buttonClassName(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="ui-button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  children,
  className = "",
  size = "md",
  variant = "primary",
  ...props
}: ButtonLinkProps) {
  return (
    <Link {...props} className={buttonClassName(variant, size, className)}>
      {children}
    </Link>
  );
}
