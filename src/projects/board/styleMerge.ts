import type { StyleState } from "./style";

/**
 * Estilo del panel para una selección múltiple (spec §5.4: se aplica a todos).
 * Puro, sin Fabric. Una propiedad se muestra si la tiene cualquiera de los objetos;
 * si sus valores difieren queda "mixta" (ninguna muestra marcada; tamaño 0 = mixto).
 */

export const MIXED = "mixed";

type Key = "fill" | "stroke" | "strokeWidth" | "fontSize";

function merge<K extends Key>(states: StyleState[], key: K, mixed: NonNullable<StyleState[K]>): StyleState[K] {
  const values = states.map((s) => s[key]).filter((v) => v !== null);
  if (!values.length) return null as StyleState[K];
  return (values.every((v) => v === values[0]) ? values[0] : mixed) as StyleState[K];
}

export function mergeStyles(states: StyleState[]): StyleState {
  const [first] = states;
  if (states.length === 1) return first;
  const same = <T,>(f: (s: StyleState) => T) => states.every((s) => f(s) === f(first));
  const labels = states.filter((s) => s.stroke !== null).map((s) => s.strokeLabel);
  return {
    kind: same((s) => s.kind) ? first.kind : undefined,
    fill: merge(states, "fill", MIXED),
    stroke: merge(states, "stroke", MIXED),
    strokeWidth: merge(states, "strokeWidth", 0),
    fontSize: merge(states, "fontSize", 0),
    opacity: first.opacity,
    strokeLabel: labels.length && labels.every((l) => l === labels[0]) ? labels[0] : "Color",
  };
}
