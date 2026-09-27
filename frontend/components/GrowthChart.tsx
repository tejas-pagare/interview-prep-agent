"use client";
import { useEffect, useRef, useState } from "react";

// A realistic-looking (not real) trajectory across seven sessions. Kept in code so the
// hero animation lands the same way for everyone; the report's real chart lives elsewhere.
const DATA = [
  { s: 1, v: 2.4 }, { s: 2, v: 2.7 }, { s: 3, v: 3.1 },
  { s: 4, v: 3.3 }, { s: 5, v: 3.7 }, { s: 6, v: 4.0 }, { s: 7, v: 4.3 },
];

const W = 720, H = 260, PADX = 44, PADY = 30;
const MIN = 1, MAX = 5;
const x = (s: number) => PADX + ((s - 1) / (DATA.length - 1)) * (W - PADX * 2);
const y = (v: number) => H - PADY - ((v - MIN) / (MAX - MIN)) * (H - PADY * 2);

const linePath = "M " + DATA.map((d) => `${x(d.s)},${y(d.v)}`).join(" L ");
const areaPath =
  `M ${x(DATA[0].s)},${H - PADY} L ` +
  DATA.map((d) => `${x(d.s)},${y(d.v)}`).join(" L ") +
  ` L ${x(DATA[DATA.length - 1].s)},${H - PADY} Z`;
const last = DATA[DATA.length - 1];
const lift = Math.round(((last.v - DATA[0].v) / DATA[0].v) * 100);

/**
 * An animated line chart showing session-over-session improvement. Draws itself in
 * once when scrolled into view (path stroke + area fade + staggered data-point pops
 * + a callout landing on the last point).
 */
export default function GrowthChart() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) return setActive(true);
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setActive(true); io.disconnect(); } },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`growth ${active ? "in" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Score improves from ${DATA[0].v} to ${last.v} across ${DATA.length} sessions`}>
        <defs>
          <linearGradient id="growth-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + Y-axis labels */}
        {[2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={PADX} y1={y(v)} x2={W - PADX} y2={y(v)} stroke="var(--line)" strokeDasharray="2 5" />
            <text x={PADX - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{v}</text>
          </g>
        ))}

        <path className="growth-area" d={areaPath} fill="url(#growth-grad)" />
        <path className="growth-line" d={linePath} pathLength={100} fill="none" stroke="var(--brand)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />

        {DATA.map((d, i) => (
          <g key={d.s} className="growth-dot" style={{ transitionDelay: `${1100 + i * 90}ms` }}>
            <circle cx={x(d.s)} cy={y(d.v)} r={7} fill="var(--brand)" opacity={0.18} />
            <circle cx={x(d.s)} cy={y(d.v)} r={4} fill="var(--brand)" />
          </g>
        ))}

        {DATA.map((d) => (
          <text key={`x-${d.s}`} x={x(d.s)} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--ink-3)">
            Session&nbsp;{d.s}
          </text>
        ))}

        {/* Callout on the final point */}
        <g className="growth-cta" transform={`translate(${x(last.s) - 108}, ${y(last.v) - 56})`}>
          <path d="M 0 0 L 96 0 L 96 32 L 60 32 L 52 40 L 44 32 L 0 32 Z" fill="var(--surface)" stroke="var(--brand)" strokeWidth={1.5} />
          <text x={48} y={20} textAnchor="middle" fontSize={12} fontWeight={650} fill="var(--brand-600)">+{lift}% score</text>
        </g>
      </svg>
      <div className="growth-legend">
        <span><b>{last.v.toFixed(1)}</b> current average</span>
        <span><b>{DATA.length}</b> sessions</span>
        <span><b>+{lift}%</b> vs first session</span>
      </div>
    </div>
  );
}
