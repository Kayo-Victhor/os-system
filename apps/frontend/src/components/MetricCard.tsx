import { Surface } from "./Surface.tsx";

type MetricTone = "neutral" | "primary" | "warning" | "success";

export function MetricCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: MetricTone;
  value: number;
}) {
  return (
    <Surface className={`ui-metric-card ui-metric-card--${tone}`}>
      <strong className="ui-metric-card__value">{value}</strong>
      <span className="ui-metric-card__label">{label}</span>
    </Surface>
  );
}
