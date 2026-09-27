export const band = (s: number) => (s >= 4 ? "hi" : s >= 3 ? "mid" : "lo");
const hue = { hi: "var(--pos)", mid: "var(--mid)", lo: "var(--neg)" } as const;

export default function ScoreRing({ score, size = 128 }: { score: number; size?: number }) {
  const r = 56, c = 2 * Math.PI * r;
  return (
    <div className="gauge" style={{ width: size, height: size }}
         role="img" aria-label={`Overall score ${score.toFixed(1)} out of 5`}>
      <svg width={size} height={size} viewBox="0 0 128 128" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--rule)" strokeWidth="4" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={hue[band(score)]} strokeWidth="4" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(Math.max(score, 0), 5) / 5)}
                style={{ transition: "stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div className="mid"><div><b className="num">{score.toFixed(1)}</b><span>of 5</span></div></div>
    </div>
  );
}
