import { useEffect, useRef, useState } from "react";
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
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<Point>();
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const numberFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 20,
  });
  const activePoint =
    active && points.find((point) => point.key === active.key);
  const maximum = points.reduce(
    (value, point) => Math.max(value, point.value),
    Math.max(1, target?.value ?? 0),
  );
  const max = kind === "bar" ? Math.ceil(maximum / 4) * 4 : maximum;
  // Match SVG units to CSS pixels so labels and hit targets do not shrink.
  const height = 230;
  const narrow = width < 480;
  const hitRadius = narrow ? 16 : 22;
  const left = 54;
  const right = 24;
  const top = 24;
  const bottom = 52;
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
  function selectPointerPoint(event: { clientX: number; clientY: number }) {
    const bounds = chartRef.current
      ?.querySelector("svg")
      ?.getBoundingClientRect();
    if (!bounds) return;
    const pointerX = ((event.clientX - bounds.left) * width) / bounds.width;
    const pointerY = ((event.clientY - bounds.top) * height) / bounds.height;
    let nearest: Point | undefined;
    let distance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const candidate =
        (x(index) - pointerX) ** 2 +
        (kind === "line" ? (y(point.value) - pointerY) ** 2 : 0);
      if (candidate < distance) {
        distance = candidate;
        nearest = point;
      }
    });
    // Dense targets can overlap. Select the nearest point, not the last SVG node.
    setActive(nearest);
  }
  return (
    <div className="training-chart" ref={chartRef}>
      {target ? (
        <p className="chart-target">
          <span>
            {target.label}: {numberFormatter.format(target.value)}
          </span>
        </p>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        height={height}
        aria-label={label}
      >
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
            onClick={selectPointerPoint}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActive(p);
              }
            }}
            aria-label={`${p.label}: ${numberFormatter.format(p.value)}`}
            onFocus={() => setActive(p)}
            onBlur={() => setActive(undefined)}
            onMouseEnter={selectPointerPoint}
            onMouseMove={selectPointerPoint}
            onMouseLeave={() => setActive(undefined)}
          >
            <title>{`${p.label}: ${numberFormatter.format(p.value)}`}</title>
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
            <circle
              className="chart-point-target"
              cx={x(i)}
              cy={y(p.value)}
              r={hitRadius}
            />
          </g>
        ))}
        {[
          ...new Set([
            0,
            ...(narrow ? [] : [Math.floor((points.length - 1) / 2)]),
            points.length - 1,
          ]),
        ]
          .filter((i) => i >= 0 && i < points.length)
          .map((i) => (
            <text
              key={points[i].key}
              className="chart-axis chart-axis-date"
              x={x(i)}
              // Use separate rows on narrow charts to keep full dates readable.
              y={height - (narrow && i === 0 && points.length > 1 ? 26 : 10)}
              textAnchor={
                points.length === 1
                  ? "middle"
                  : i === 0
                    ? "start"
                    : i === points.length - 1
                      ? "end"
                      : "middle"
              }
            >
              {points[i].axisLabel ?? points[i].label}
            </text>
          ))}
      </svg>
      <p className="chart-tooltip" aria-live="polite">
        {activePoint
          ? `${activePoint.label}: ${numberFormatter.format(activePoint.value)}`
          : "\u00a0"}
      </p>
      <details className="chart-data">
        <summary>{dataLabel}</summary>
        <dl>
          {points.map((p) => (
            <div className="chart-data-row" key={p.key}>
              <dt>{p.label}</dt>
              <dd>{numberFormatter.format(p.value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
