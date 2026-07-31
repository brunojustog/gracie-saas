/**
 * Gráfico de pizza (donut) em SVG puro — sem dependência externa. v1.1-CE.
 * Usado nos cartões de professor pra distribuição de aulas por modalidade.
 */
export const PIE_COLORS = [
  "#e11d74", // primary rosa
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
  "#a3a3a3",
];

type Slice = { label: string; value: number };

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = (angle - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function Pie({ slices, size = 120 }: { slices: Slice[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const inner = r * 0.58;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="#e5e7eb" />
        <circle cx={cx} cy={cy} r={inner} fill="var(--card, #fff)" />
      </svg>
    );
  }

  // Caso 1 fatia = 100%: um anel cheio (arc de 360 não desenha).
  if (slices.length === 1) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill={PIE_COLORS[0]} />
        <circle cx={cx} cy={cy} r={inner} fill="var(--card, #fff)" />
      </svg>
    );
  }

  let angle = 0;
  const paths = slices.map((s, i) => {
    const frac = s.value / total;
    const start = angle;
    const end = angle + frac * 360;
    angle = end;
    const p1 = polar(cx, cy, r, start);
    const p2 = polar(cx, cy, r, end);
    const large = end - start > 180 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
    return <path key={i} d={d} fill={PIE_COLORS[i % PIE_COLORS.length]} />;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      <circle cx={cx} cy={cy} r={inner} fill="var(--card, #fff)" />
    </svg>
  );
}
