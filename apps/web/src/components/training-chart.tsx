import { useState } from "react";
import type { Locale } from "@/lib/locales";

type Point = {
  key: string;
  label: string;
  axisLabel?: string;
  value: number;
};
export function TrainingChart({
  points,
  label,
  kind,
  dataLabel,
  target,
  locale = "en",
}: {
  points: Point[];
  locale?: Locale;
  label: string;
  kind: "line" | "bar";
  dataLabel: string;
  target?: { value: number; label: string };
}) {
  const [active, setActive] = useState<Point>();
  const activePoint =
    active && points.find((point) => point.key === active.key);
  const maximum = points.reduce(
    (value, point) => Math.max(value, point.value),
    Math.max(1, target?.value ?? 0),
  );
  const max = kind === "bar" ? Math.ceil(maximum / 4) * 4 : maximum;
  const width = 600;
  const height = 230;
  const left = 54;
  const right = 18;
  const top = 18;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  // UTC is used only for stable SVG spacing; displayed dates are server-provided local date labels.
  const timestamps = points.map((p) =>
    new Date(`${p.key}T00:00:00Z`).getTime(),
  );
  const first = timestamps[0] ?? 0;
  const last = timestamps.at(-1) ?? first;
  const x = (i: number) =>
    kind === "bar"
      ? left + ((i + 0.5) * plotWidth) / Math.max(points.length, 1)
      : left +
        (last === first ? 0.5 : (timestamps[i] - first) / (last - first)) *
          plotWidth;
  const y = (value: number) => top + plotHeight * (1 - value / max);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  return (
    <div className="training-chart">
      <svg viewBox={`0 0 ${width} ${height}`} aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              className="chart-gridline"
              x1={left}
              x2={width - right}
              y1={y(max * f)}
              y2={y(max * f)}
            />
            <text
              className="chart-axis"
              x={left - 8}
              y={y(max * f) + 4}
              textAnchor="end"
            >
              {new Intl.NumberFormat(locale, {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(max * f)}
            </text>
          </g>
        ))}
        {target ? (
          <g>
            <line
              x1={left}
              x2={width - right}
              y1={y(target.value)}
              y2={y(target.value)}
              stroke="var(--red-9)"
              strokeDasharray="5 5"
            />
            <text x={left} y={y(target.value) - 4} className="chart-axis">
              {target.label}: {target.value}
            </text>
          </g>
        ) : null}
        {kind === "line" && points.length ? (
          <>
            <polygon
              className="chart-area"
              points={`${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}`}
            />
            <polyline className="chart-line" points={line} />
          </>
        ) : null}
        {points.map((p, i) => (
          // biome-ignore lint/a11y/useSemanticElements: SVG needs a button role with explicit keyboard behavior.
          <g
            key={p.key}
            tabIndex={0}
            role="button"
            onClick={() => setActive(p)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActive(p);
              }
            }}
            aria-label={`${p.label}: ${p.value}`}
            onFocus={() => setActive(p)}
            onBlur={() => setActive(undefined)}
            onMouseEnter={() => setActive(p)}
            onMouseLeave={() => setActive(undefined)}
          >
            <title>{`${p.label}: ${p.value}`}</title>
            {kind === "bar" ? (
              <rect
                className="chart-bar"
                x={
                  x(i) -
                  Math.min(20, (plotWidth / Math.max(points.length, 1)) * 0.3)
                }
                y={y(p.value)}
                width={Math.min(
                  40,
                  (plotWidth / Math.max(points.length, 1)) * 0.6,
                )}
                height={(plotHeight * p.value) / max}
                rx="2"
              />
            ) : (
              <circle className="chart-point" cx={x(i)} cy={y(p.value)} r="4" />
            )}
          </g>
        ))}
        {[
          ...new Set([
            0,
            Math.floor((points.length - 1) / 2),
            points.length - 1,
          ]),
        ]
          .filter((i) => i >= 0 && i < points.length)
          .map((i) => (
            <text
              key={points[i].key}
              className="chart-axis"
              x={x(i)}
              y={height - 10}
              textAnchor={
                i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
              }
            >
              {points[i].axisLabel ?? points[i].label}
            </text>
          ))}
      </svg>
      <p className="chart-tooltip" aria-live="polite">
        {activePoint
          ? `${activePoint.label}: ${new Intl.NumberFormat(locale).format(activePoint.value)}`
          : "\u00a0"}
      </p>
      <details className="chart-data">
        <summary>{dataLabel}</summary>
        <dl>
          {points.map((p) => (
            <div className="chart-data-row" key={p.key}>
              <dt>{p.label}</dt>
              <dd>{new Intl.NumberFormat(locale).format(p.value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
