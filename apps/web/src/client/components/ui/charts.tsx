// Charts: inline SVG, one series, the accent as the data color.
// Columns: <= 24px thick, 4px rounded data-end, square baseline, 2px surface
// gap, hairline solid gridlines, per-bar hover tooltip. Sparkline: 2px line.
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { compact, dayLabel } from "../../lib/format";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** A column path with a rounded top (r) and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function BarChart({
  series,
  height = 168,
  unit = "hits",
  className,
}: {
  series: { day: string; hits: number }[];
  height?: number;
  unit?: string;
  className?: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 8, right: 8, bottom: 22, left: 30 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const n = series.length;
  const max = niceMax(Math.max(0, ...series.map((d) => d.hits)));
  const band = n ? innerW / n : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const ticks = [0, max / 2, max];
  const total = series.reduce((s, d) => s + d.hits, 0);
  const labelEvery = n > 14 ? 7 : n > 7 ? 2 : 1;

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block overflow-visible"
          role="img"
          aria-label={`${unit} per day, last ${n} days`}
        >
          {ticks.map((t) => {
            const y = pad.top + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  className="stroke-border"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={pad.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground num"
                  fontSize={10}
                >
                  {compact(t)}
                </text>
              </g>
            );
          })}
          {series.map((d, i) => {
            const x = pad.left + i * band + (band - barW) / 2;
            const h = (d.hits / max) * innerH;
            const y = pad.top + innerH - h;
            const active = hover === i;
            return (
              <g key={d.day}>
                {d.hits > 0 && (
                  <path
                    d={columnPath(x, y, barW, h, 4)}
                    className={cn("fill-chart", hover !== null && !active && "opacity-60")}
                  />
                )}
                {d.hits === 0 && (
                  <rect
                    x={x}
                    y={pad.top + innerH - 1}
                    width={barW}
                    height={1}
                    className="fill-border"
                  />
                )}
                {i % labelEvery === 0 && (
                  <text
                    x={x + barW / 2}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={10}
                  >
                    {dayLabel(d.day)}
                  </text>
                )}
                <rect
                  x={pad.left + i * band}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={-1}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && series[hover] && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md"
          style={{
            left: pad.left + hover * band + band / 2,
            top: 0,
            transform: "translate(-50%, -110%)",
          }}
        >
          <span className="num font-semibold">{series[hover].hits}</span>{" "}
          <span className="text-muted-foreground">
            {unit} · {dayLabel(series[hover].day, true)}
          </span>
        </div>
      )}
      {total === 0 && width > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-meta">
          No {unit} in this period
        </div>
      )}
    </div>
  );
}

export function Sparkline({
  values,
  width = 88,
  height = 26,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1] ?? [0, height];
  return (
    <svg width={width} height={height} className={cn("overflow-visible", className)} aria-hidden>
      <path
        d={d}
        fill="none"
        className="stroke-chart-muted"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={4} className="fill-card" />
      <circle cx={lx} cy={ly} r={2.5} className="fill-chart" />
    </svg>
  );
}
