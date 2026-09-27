"use client";
import {
  ComponentType, CSSProperties, KeyboardEvent, ReactNode, SVGProps, useCallback, useEffect, useRef, useState,
} from "react";
import { Branch, Chart, Chat, Cpu, Doc, List, Mic, Pause, Play, Target } from "./Icons";

type NodeId = "inputs" | "profile" | "plan" | "question" | "answer" | "evaluate" | "followup" | "report";
type EdgeId = "e1" | "e2" | "e3" | "e4" | "e5" | "e6" | "e7" | "e8" | "e9";

/* ---------------------------------------------------------------------------
   The graph. It mirrors the real LangGraph in graph/builder.py: a straight
   preparation lane, then an interview loop with two cycles (follow-ups go back
   to Answer, the next question goes back to Question), and the report only
   after the last question. `step` is the walkthrough step that lights it up.
--------------------------------------------------------------------------- */
const NODES: {
  id: NodeId; title: string; sub: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>; step: number; human?: boolean;
}[] = [
  { id: "inputs",   title: "Resume + JD", sub: "PDF, DOCX, TXT", Icon: Doc,    step: 0 },
  { id: "profile",  title: "Profile",     sub: "LLM analysis",   Icon: Cpu,    step: 1 },
  { id: "plan",     title: "Plan",        sub: "topic weights",  Icon: List,   step: 2 },
  { id: "question", title: "Question",    sub: "with criteria",  Icon: Chat,   step: 3 },
  { id: "answer",   title: "Answer",      sub: "you respond",    Icon: Mic,    step: 3, human: true },
  { id: "evaluate", title: "Evaluate",    sub: "score 1–5",      Icon: Target, step: 3 },
  { id: "followup", title: "Follow-up",   sub: "up to 2",        Icon: Branch, step: 3 },
  { id: "report",   title: "Report",      sub: "scored in code", Icon: Chart,  step: 4 },
];

const EDGES: { id: EdgeId; step: number; cond?: boolean; label?: string }[] = [
  { id: "e1", step: 1 },                                  // inputs   -> profile
  { id: "e2", step: 2 },                                  // profile  -> plan
  { id: "e3", step: 3 },                                  // plan     -> question
  { id: "e4", step: 3 },                                  // question -> answer
  { id: "e5", step: 3 },                                  // answer   -> evaluate
  { id: "e6", step: 3, cond: true, label: "score < 4" },  // evaluate -> follow-up
  { id: "e7", step: 3, cond: true },                      // follow-up -> answer
  { id: "e8", step: 3, cond: true, label: "next question" }, // evaluate -> question
  { id: "e9", step: 4, label: "after the last question" }, // evaluate -> report
];

type Label = { x: number; y: number; anchor?: "start" | "middle" | "end"; rotate?: number };
type Layout = {
  w: number; h: number; nw: number; nh: number;
  pos: Record<NodeId, { x: number; y: number }>;
  edges: Record<EdgeId, { d: string; label?: Label }>;
};

/** Wide screens: two lanes, read left to right, then right to left along the loop. */
const WIDE: Layout = (() => {
  const nw = 122, nh = 52, hw = nw / 2, hh = nh / 2;
  const X = [74, 226, 378, 530];          // column centres
  const Y1 = 50, Y2 = 196, YF = 290;      // prep lane, loop lane, follow-up row
  const FX = 454, QX = 496;               // follow-up column; where "next question" re-enters
  const YC = (Y1 + hh + Y2 - hh) / 2;     // channel between the lanes
  return {
    w: 604, h: YF + hh + 12, nw, nh,
    pos: {
      inputs: { x: X[0], y: Y1 }, profile: { x: X[1], y: Y1 }, plan: { x: X[2], y: Y1 },
      question: { x: X[3], y: Y1 }, answer: { x: X[3], y: Y2 }, evaluate: { x: X[2], y: Y2 },
      followup: { x: FX, y: YF }, report: { x: X[0], y: Y2 },
    },
    edges: {
      e1: { d: `M${X[0] + hw} ${Y1} H${X[1] - hw}` },
      e2: { d: `M${X[1] + hw} ${Y1} H${X[2] - hw}` },
      e3: { d: `M${X[2] + hw} ${Y1} H${X[3] - hw}` },
      e4: { d: `M${X[3]} ${Y1 + hh} V${Y2 - hh}` },
      e5: { d: `M${X[3] - hw} ${Y2} H${X[2] + hw}` },
      e6: { d: `M${X[2]} ${Y2 + hh} V${YF - 12} Q${X[2]} ${YF} ${X[2] + 12} ${YF} H${FX - hw}`,
            label: { x: X[2] - 8, y: (Y2 + hh + YF) / 2 + 4, anchor: "end" } },
      e7: { d: `M${FX + hw} ${YF} Q${X[3]} ${YF} ${X[3]} ${YF - 15} V${Y2 + hh}` },
      e8: { d: `M${X[2]} ${Y2 - hh} V${YC + 14} Q${X[2]} ${YC} ${X[2] + 14} ${YC} H${QX - 14} Q${QX} ${YC} ${QX} ${YC - 14} V${Y1 + hh}`,
            label: { x: (X[2] + QX) / 2, y: YC - 7 } },
      e9: { d: `M${X[2] - hw} ${Y2} H${X[0] + hw}`, label: { x: X[1], y: Y2 - 9 } },
    },
  };
})();

/** Phones: one vertical spine, follow-up loop to the right, next-question loop to the left. */
const TALL: Layout = (() => {
  const nw = 132, nh = 48, hw = nw / 2, hh = nh / 2, r = 14;
  const SX = 110, FX = 262, LX = 22;      // spine, follow-up column, left channel
  const Y = { inputs: 36, profile: 112, plan: 188, question: 264, answer: 340, evaluate: 416, report: 516 };
  const FY = (Y.answer + Y.evaluate) / 2;
  return {
    w: 340, h: Y.report + hh + 12, nw, nh,
    pos: {
      inputs: { x: SX, y: Y.inputs }, profile: { x: SX, y: Y.profile }, plan: { x: SX, y: Y.plan },
      question: { x: SX, y: Y.question }, answer: { x: SX, y: Y.answer }, evaluate: { x: SX, y: Y.evaluate },
      followup: { x: FX, y: FY }, report: { x: SX, y: Y.report },
    },
    edges: {
      e1: { d: `M${SX} ${Y.inputs + hh} V${Y.profile - hh}` },
      e2: { d: `M${SX} ${Y.profile + hh} V${Y.plan - hh}` },
      e3: { d: `M${SX} ${Y.plan + hh} V${Y.question - hh}` },
      e4: { d: `M${SX} ${Y.question + hh} V${Y.answer - hh}` },
      e5: { d: `M${SX} ${Y.answer + hh} V${Y.evaluate - hh}` },
      e6: { d: `M${SX + hw} ${Y.evaluate} H${FX - r} Q${FX} ${Y.evaluate} ${FX} ${FY + hh}`,
            label: { x: (SX + hw + FX - r) / 2, y: Y.evaluate + 15 } },
      e7: { d: `M${FX} ${FY - hh} Q${FX} ${Y.answer} ${FX - r} ${Y.answer} H${SX + hw}` },
      e8: { d: `M${SX - hw} ${Y.evaluate} H${LX + r} Q${LX} ${Y.evaluate} ${LX} ${Y.evaluate - r} V${Y.question + r} Q${LX} ${Y.question} ${LX + r} ${Y.question} H${SX - hw}`,
            label: { x: LX - 8, y: (Y.question + Y.evaluate) / 2, rotate: -90 } },
      e9: { d: `M${SX} ${Y.evaluate + hh} V${Y.report - hh}`,
            label: { x: SX + 10, y: (Y.evaluate + Y.report) / 2 + 4, anchor: "start" } },
    },
  };
})();

/* ---------------------------------------------------------------------------
   The five steps a visitor reads. Each lights up its part of the diagram,
   sends a data token along `route`, and shows what that stage hands on.
--------------------------------------------------------------------------- */
const K = ({ children }: { children: ReactNode }) => <span className="k">{children}</span>;
const S = ({ children }: { children: ReactNode }) => <span className="s">{children}</span>;
const N = ({ children }: { children: ReactNode }) => <span className="n">{children}</span>;
const C = ({ children }: { children: ReactNode }) => <span className="c">{children}</span>;

const STEPS: { kicker: string; title: string; body: string; route: EdgeId[]; out: string; code: ReactNode }[] = [
  {
    kicker: "Input", title: "Upload your resume",
    body: "Add a PDF, DOCX or text file. Paste the job description too, and say what you want to focus on.",
    route: [], out: "What you send",
    code: <>{"{\n  "}<K>&quot;resume&quot;</K>{": "}<S>&quot;resume.pdf&quot;</S>{",\n  "}<K>&quot;job_description&quot;</K>{": "}<S>&quot;Senior Frontend Engineer…&quot;</S>{",\n  "}<K>&quot;focus&quot;</K>{": "}<S>&quot;React performance, system design&quot;</S>{"\n}"}</>,
  },
  {
    kicker: "Analysis", title: "The AI reads your background",
    body: "Your resume is compared with the role to build a profile: your level, your strongest skills, and the gaps the job cares about.",
    route: ["e1"], out: "Candidate profile",
    code: <>{"{\n  "}<K>&quot;level&quot;</K>{": "}<S>&quot;senior&quot;</S>{",\n  "}<K>&quot;skills&quot;</K>{": ["}<S>&quot;React&quot;</S>{", "}<S>&quot;TypeScript&quot;</S>{", "}<S>&quot;GraphQL&quot;</S>{"],\n  "}<K>&quot;gaps&quot;</K>{": ["}<S>&quot;system design at scale&quot;</S>{"]\n}"}</>,
  },
  {
    kicker: "Planning", title: "It plans a tailored interview",
    body: "Topics are weighted by your focus first, then the job description, then your resume, starting easy and ramping up.",
    route: ["e2"], out: "Interview plan",
    code: <>{"[\n  { "}<K>&quot;topic&quot;</K>{": "}<S>&quot;React performance&quot;</S>{", "}<K>&quot;weight&quot;</K>{": "}<N>3</N>{", "}<K>&quot;difficulty&quot;</K>{": "}<S>&quot;medium&quot;</S>{" },\n  { "}<K>&quot;topic&quot;</K>{": "}<S>&quot;System design&quot;</S>{",     "}<K>&quot;weight&quot;</K>{": "}<N>2</N>{", "}<K>&quot;difficulty&quot;</K>{": "}<S>&quot;hard&quot;</S>{" },\n  { "}<K>&quot;topic&quot;</K>{": "}<S>&quot;Behavioural&quot;</S>{",       "}<K>&quot;weight&quot;</K>{": "}<N>1</N>{", "}<K>&quot;difficulty&quot;</K>{": "}<S>&quot;easy&quot;</S>{" }\n]"}</>,
  },
  {
    kicker: "Interview loop", title: "Answer, get graded, get probed",
    body: "Every question carries hidden criteria. Miss one and a follow-up targets exactly that gap (up to twice) before the next question.",
    route: ["e4", "e5", "e6", "e7", "e5", "e8"], out: "One graded turn",
    code: <>{"{\n  "}<K>&quot;question&quot;</K>{": "}<S>&quot;How did you diagnose the slow table?&quot;</S>{",\n  "}<K>&quot;criteria&quot;</K>{": ["}<S>&quot;profiled first&quot;</S>{", "}<S>&quot;explained re-renders&quot;</S>{"],\n  "}<K>&quot;score&quot;</K>{": "}<N>3</N>{", "}<K>&quot;missed&quot;</K>{": ["}<S>&quot;profiled first&quot;</S>{"]  "}<C>{"// → follow-up"}</C>{"\n}"}</>,
  },
  {
    kicker: "Report", title: "A report you can act on",
    body: "Scores are calculated from the criteria you met, per topic. The AI writes the advice; it never invents the numbers.",
    route: ["e9"], out: "Final report",
    code: <>{"{\n  "}<K>&quot;overall&quot;</K>{": "}<N>3.6</N>{",  "}<C>{"// averaged in code"}</C>{"\n  "}<K>&quot;topics&quot;</K>{": { "}<K>&quot;React&quot;</K>{": "}<N>4.0</N>{", "}<K>&quot;System design&quot;</K>{": "}<N>3.2</N>{" },\n  "}<K>&quot;next&quot;</K>{": ["}<S>&quot;Profile before you optimise&quot;</S>{"]\n}"}</>,
  },
];

const DWELL_MS = 6500;   // how long each step stays up while auto-playing
const SPEED = 0.1;       // token speed, px per ms
const MIN_LOOP = 1300;   // short edges still get a readable token pass

/** Tracks a media query. False on the server and the first client render, so hydration matches. */
function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/**
 * The landing page's "how it works": a stepper on the left drives a live system diagram
 * on the right that mirrors the real interview graph, including both loops.
 *
 * Auto-play advances through the steps while the section is on screen; it pauses on
 * hover or keyboard focus, and stops for good once the visitor picks a step (the play
 * button resumes it). Advancing is driven by the progress bar's `animationend`, so a
 * paused bar pauses the stepper too, with no timer to keep in sync. With
 * reduced motion, nothing auto-plays or moves.
 */
export default function SystemFlow() {
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);                 // restarts the progress bar
  const [auto, setAuto] = useState(true);
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [inView, setInView] = useState(false);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const compact = useMedia("(max-width: 600px)");
  const L = compact ? TALL : WIDE;
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const edgeRefs = useRef<Partial<Record<EdgeId, SVGPathElement | null>>>({});
  const token = useRef<SVGGElement>(null);

  useEffect(() => { if (reduced) setAuto(false); }, [reduced]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Move the data token along the active step's route. Driven by rAF and written
  // straight to the DOM, so it never re-renders React.
  useEffect(() => {
    const g = token.current;
    if (!g) return;
    const segs = STEPS[step].route
      .map((id) => edgeRefs.current[id])
      .filter((p): p is SVGPathElement => !!p);
    if (reduced || !inView || segs.length === 0) { g.style.opacity = "0"; return; }
    const lens = segs.map((p) => p.getTotalLength());
    const total = lens.reduce((a, b) => a + b, 0);
    const dur = Math.max(total / SPEED, MIN_LOOP);
    let raf = 0, t0 = -1;
    const tick = (t: number) => {
      if (t0 < 0) t0 = t;
      const p = ((t - t0) % dur) / dur;
      let d = p * total, i = 0;
      while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
      const pt = segs[i].getPointAtLength(Math.min(d, lens[i]));
      g.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
      g.style.opacity = String(Math.max(0, Math.min(1, p / 0.06, (1 - p) / 0.06)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, inView, reduced, compact]);

  const select = useCallback((i: number, focus = false) => {
    setStep(i);
    setRun((r) => r + 1);
    setAuto(false);                                   // the visitor is driving now
    if (focus) tabs.current[i]?.focus();
  }, []);

  const advance = useCallback(() => {
    setStep((s) => (s + 1) % STEPS.length);
    setRun((r) => r + 1);
  }, []);

  const toggleAuto = () => {
    if (!auto) setRun((r) => r + 1);
    setAuto((a) => !a);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = STEPS.length;
    let i = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") i = (step + 1) % n;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") i = (step - 1 + n) % n;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = n - 1;
    if (i >= 0) { e.preventDefault(); select(i, true); }
  };

  const playing = auto && inView && !hover && !focusIn;
  const state = (s: number) => (s === step ? "on" : s < step ? "done" : "");
  const cur = STEPS[step];

  return (
    <div
      ref={root}
      className={`sf ${playing ? "playing" : ""}`}
      style={{ ["--sf-dwell" as string]: `${DWELL_MS}ms` } as CSSProperties}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false); }}
    >
      {/* ---- stepper ---- */}
      <div className="sf-steps" role="tablist" aria-orientation="vertical" aria-label="Interview pipeline steps" onKeyDown={onKey}>
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            ref={(el) => { tabs.current[i] = el; }}
            type="button"
            role="tab"
            id={`sf-tab-${i}`}
            aria-selected={i === step}
            aria-controls="sf-panel"
            tabIndex={i === step ? 0 : -1}
            className={`sf-step ${state(i)}`}
            onClick={() => select(i)}
          >
            <span className="sf-step-rail" aria-hidden>
              <span className="sf-step-num">{String(i + 1).padStart(2, "0")}</span>
            </span>
            <span className="sf-step-main">
              <span className="sf-step-kicker">{s.kicker}</span>
              <span className="sf-step-title">{s.title}</span>
              <span className="sf-step-body"><span><span>{s.body}</span></span></span>
              {auto && i === step && (
                <span className="sf-step-progress" aria-hidden>
                  <i key={run} onAnimationEnd={advance} />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* ---- live system diagram ---- */}
      <div className="sf-panel" id="sf-panel" role="tabpanel" aria-labelledby={`sf-tab-${step}`}>
        <div className="sf-chrome">
          <span className="sf-dots" aria-hidden><i /><i /><i /></span>
          <span className="sf-chrome-t">interview-pipeline</span>
          <span className="sf-status">Step {step + 1} of {STEPS.length} · {cur.kicker}</span>
          <button type="button" className="sf-toggle" onClick={toggleAuto}
                  aria-label={auto ? "Pause the walkthrough" : "Play the walkthrough"}
                  title={auto ? "Pause the walkthrough" : "Play the walkthrough"}>
            {auto ? <Pause width={13} height={13} /> : <Play width={12} height={12} />}
          </button>
        </div>

        <div className="sf-canvas">
          <svg className={`sf-svg ${compact ? "tall" : ""}`} viewBox={`0 0 ${L.w} ${L.h}`} role="img"
               aria-label="Pipeline: resume and job description, then profile, then plan, then a loop of question, answer and evaluate. A weak answer triggers a follow-up back to answer. Otherwise the next question starts, and after the last question the report is produced.">
            <defs>
              {(["idle", "done", "on"] as const).map((k) => (
                <marker key={k} id={`sf-a-${k}`} className={`sf-a-${k}`} viewBox="0 0 10 10" refX="8.6" refY="5"
                        markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M1.5 1.5 L8.5 5 L1.5 8.5" />
                </marker>
              ))}
            </defs>

            {EDGES.map((e) => {
              const st = state(e.step);
              const geo = L.edges[e.id];
              const lb = geo.label;
              return (
                <g key={e.id}>
                  <path
                    ref={(el) => { edgeRefs.current[e.id] = el; }}
                    className={`sf-edge ${e.cond ? "cond" : ""} ${st}`}
                    d={geo.d}
                    markerEnd={`url(#sf-a-${st || "idle"})`}
                  />
                  {e.label && lb && (
                    <text className={`sf-elabel ${st}`} x={lb.x} y={lb.y} textAnchor={lb.anchor ?? "middle"}
                          transform={lb.rotate ? `rotate(${lb.rotate} ${lb.x} ${lb.y})` : undefined}>
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}

            {NODES.map((n) => {
              const st = state(n.step);
              const { x, y } = L.pos[n.id];
              const hh = L.nh / 2;
              return (
                <g key={n.id} className={`sf-node ${st} ${n.human ? "human" : ""}`} transform={`translate(${x - L.nw / 2} ${y - hh})`}>
                  <rect className="sf-ring" width={L.nw} height={L.nh} rx={12} />
                  <rect className="sf-box" width={L.nw} height={L.nh} rx={12} />
                  <g className="sf-ico" transform={`translate(12 ${hh - 9})`}>
                    <n.Icon width={18} height={18} />
                  </g>
                  <text className="sf-t" x={39} y={hh - 2}>{n.title}</text>
                  <text className="sf-s" x={39} y={hh + 12}>{n.sub}</text>
                  <g className="sf-check" transform={`translate(${L.nw - 2} 2)`} aria-hidden>
                    <circle r={7} />
                    <path d="M-3 0.2 L-0.8 2.4 L3.2 -2" />
                  </g>
                </g>
              );
            })}

            <g ref={token} className="sf-token" style={{ opacity: 0 }} aria-hidden>
              <circle className="sf-token-halo" r={9} />
              <circle className="sf-token-core" r={4.5} />
            </g>
          </svg>
        </div>

        <div className="sf-out">
          <div className="sf-out-head">
            <span>{cur.out}</span>
            <span className="sf-legend" aria-hidden>
              <span><i /> always</span>
              <span><i className="cond" /> conditional</span>
            </span>
          </div>
          <pre className="sf-code" key={step}>{cur.code}</pre>
        </div>
      </div>
    </div>
  );
}
