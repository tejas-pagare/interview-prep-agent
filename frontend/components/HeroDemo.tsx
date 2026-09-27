"use client";
import { useEffect, useState } from "react";
import { Branch, Sparkle } from "./Icons";

const SCRIPT = [
  { q: "Your CV mentions a dashboard that got slow with 10k rows. How did you diagnose it?",
    a: "I memoised the row component and it felt faster…",
    sc: "mid" as const, fbScore: "3",
    fb: "Names a fix but not a diagnosis. Missing: profiling before optimising, and why the re-renders happened.",
    fu: "What did the profiler actually show you?",
    topic: "REACT", n: "QUESTION 2 OF 5" },
  { q: "Design a rate limiter for a public API. Walk me through the trade-offs.",
    a: "I'd use a token bucket in Redis so bursts are absorbed…",
    sc: "hi" as const, fbScore: "4",
    fb: "Names the algorithm and where it lives. Missing: what happens when Redis is unavailable, and per-key vs global.",
    fu: "What's your fallback if Redis becomes unreachable mid-request?",
    topic: "SYSTEM DESIGN", n: "QUESTION 3 OF 5" },
  { q: "You inherited a 5k-line file no one wants to touch. How would you approach it?",
    a: "First read tests. If none, add characterisation tests before changing a line…",
    sc: "hi" as const, fbScore: "5",
    fb: "Right instinct — tests first, then extract seams. Also touched on risk isolation.",
    fu: "How do you split work so reviewers don't drown in the diff?",
    topic: "REFACTORING", n: "QUESTION 4 OF 5" },
];

/**
 * The hero card that cycles through a few scripted interview turns. Each cycle types the
 * answer character-by-character, pops the feedback, then swaps to the next turn. Pauses
 * on hover so the visitor can actually read a card that catches their eye.
 */
export default function HeroDemo() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"typing" | "feedback" | "followup">("typing");
  const [hover, setHover] = useState(false);
  const s = SCRIPT[i];

  useEffect(() => {
    if (hover) return;
    setPhase("typing");
    const t1 = setTimeout(() => setPhase("feedback"), 2400);
    const t2 = setTimeout(() => setPhase("followup"), 3800);
    const t3 = setTimeout(() => setI((n) => (n + 1) % SCRIPT.length), 6200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [i, hover]);

  return (
    <div className="demo demo-live-card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
         aria-label="Sample interview turn">
      <div className="demo-top">
        <i /><i /><i />
        <span className="demo-live"><span className="demo-live-dot" />Live grading</span>
        <span>{s.n} · {s.topic}</span>
      </div>
      <div className="demo-body" key={i}>
        <p className="demo-q demo-fade" style={{ margin: 0 }}>{s.q}</p>

        <p className="demo-a demo-typing" style={{ margin: 0 }}>
          {s.a}<span className="demo-caret" aria-hidden />
        </p>

        <div className={`demo-fb demo-pop ${phase === "typing" ? "hide" : ""}`}>
          <span className={`sc ${s.sc} num`}>{s.fbScore}</span>
          <span className="muted">{s.fb}</span>
        </div>

        <div className={`demo-next demo-pop ${phase !== "followup" ? "hide" : ""}`}>
          <Branch width={15} height={15} />
          Follow-up: “{s.fu}”
        </div>
      </div>
      <div className="demo-cursor" aria-hidden>
        <Sparkle width={11} height={11} /> AI is grading against 3 hidden signals
      </div>
    </div>
  );
}
