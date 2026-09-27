import type { Turn } from "@/lib/api";
import DiagramCanvas from "./DiagramCanvas";
import { Branch, Chevron, Sketch } from "./Icons";
import { band } from "./ScoreRing";

/** A main question together with the follow-ups it triggered. */
type Group = { main: Turn; followups: Turn[] };

function group(turns: Turn[]): Group[] {
  const out: Group[] = [];
  for (const t of turns) {
    if (t.kind === "followup" && out.length) out[out.length - 1].followups.push(t);
    else out.push({ main: t, followups: [] });
  }
  return out;
}

function Signals({ met = [], missed = [] }: { met?: string[]; missed?: string[] }) {
  if (met.length === 0 && missed.length === 0) return null;
  return (
    <div className="sigs">
      <div className="sig ok">
        <div className="k">What you covered ({met.length})</div>
        {met.length ? <ul>{met.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    : <p className="none">Nothing from the checklist came through.</p>}
      </div>
      <div className="sig no">
        <div className="k">What was missing ({missed.length})</div>
        {missed.length ? <ul>{missed.map((s, i) => <li key={i}>{s}</li>)}</ul>
                       : <p className="none">Nothing missing — all signals covered.</p>}
      </div>
    </div>
  );
}

/** The shared body: why it was asked, what you said, signal analysis, verdict. */
function Analysis({ turn }: { turn: Turn }) {
  return (
    <>
      {turn.rationale && (
        <div className="blk why">
          <div className="k">Why you were asked this</div>
          <p>{turn.rationale}</p>
        </div>
      )}

      {turn.expected_signals && turn.expected_signals.length > 0 && (
        <div className="blk">
          <div className="k">What a strong answer had to show</div>
          <ul className="bullets muted">{turn.expected_signals.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      {turn.diagram && (turn.diagram.nodes.length > 0 || turn.diagram.edges.length > 0) && (
        <div className="blk">
          <div className="k row" style={{ gap: 6 }}><Sketch width={13} height={13} /> Your diagram</div>
          <DiagramCanvas value={turn.diagram} readOnly resetKey={turn.question} hint={turn.canvas_hint ?? undefined} />
        </div>
      )}

      <div className="blk">
        <div className="k">{turn.diagram ? "Your explanation" : "Your answer"}</div>
        <p className="answer-q">{turn.answer || <span className="faint">(none written)</span>}</p>
      </div>

      <Signals met={turn.signals_met} missed={turn.signals_missed} />

      <div className="blk">
        <div className="k">Assessment</div>
        <p>{turn.feedback}</p>
      </div>
    </>
  );
}

export default function QuestionBreakdown({ turns }: { turns: Turn[] }) {
  const groups = group(turns);

  return (
    <div>
      {groups.map((g, i) => (
        <details className="qcard" key={i} open>
          <summary>
            <span className={`sc ${band(g.main.score)} num`}>{g.main.score}</span>
            <span className="head-txt">
              <span className="lbl">
                Question {i + 1} · {g.main.topic}
                {g.followups.length > 0 && ` · ${g.followups.length} follow-up${g.followups.length > 1 ? "s" : ""}`}
              </span>
              <span className="qt">{g.main.question}</span>
            </span>
            <Chevron className="chev" />
          </summary>

          <div className="qbody">
            <Analysis turn={g.main} />

            {g.followups.map((f, j) => (
              <div className="fup" key={j}>
                <div>
                  <span className="fup-tag"><Branch width={13} height={13} /> Follow-up {j + 1}</span>
                  <p className="fq">{f.question}</p>
                </div>
                <Analysis turn={f} />
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
