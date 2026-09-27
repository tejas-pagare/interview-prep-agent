import type { Report, Turn } from "@/lib/api";
import QuestionBreakdown from "./QuestionBreakdown";
import ScoreRing, { band } from "./ScoreRing";

const verdict = (s: number) =>
  s >= 4.2 ? "Interview-ready" : s >= 3.2 ? "Nearly there" : s >= 2.2 ? "Needs focused practice" : "Early days";

function Column({ title, items, color }: { title: string; items: string[]; color?: string }) {
  return (
    <div>
      <h3 style={{ color }}>{title}</h3>
      <ul className="bullets">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

export default function ReportView({ report, turns = [] }: { report: Report; turns?: Turn[] }) {
  return (
    <div className="stack">
      <section className="panel">
        <div className="pad verdict">
          <ScoreRing score={report.overall_score} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <span className="eyebrow">Evaluation</span>
            <h2 className="display" style={{ margin: "6px 0 10px" }}>{verdict(report.overall_score)}</h2>
            <p className="muted" style={{ margin: 0 }}>{report.summary}</p>
          </div>
        </div>
      </section>

      {report.topic_scores.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h3>By topic</h3></div>
          <div className="pad">
            {report.topic_scores.map((t) => (
              <div className="tscore" key={t.topic}>
                <span>{t.topic}</span>
                <span className="meter"><span style={{ display: "block", height: "100%", width: `${(t.score / 5) * 100}%`,
                      background: { hi: "var(--pos)", mid: "var(--mid)", lo: "var(--neg)" }[band(t.score)] }} /></span>
                <b className="num">{t.score.toFixed(1)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel three">
        <Column title="Strengths" items={report.strengths} color="var(--pos)" />
        <Column title="Gaps" items={report.gaps} color="var(--mid)" />
        <Column title="What to do next" items={report.recommendations} />
      </section>

      {turns.length > 0 && (
        <section>
          <div className="panel-head" style={{ padding: "0 0 14px", border: 0 }}>
            <h3>Question by question</h3>
            <span className="small faint" style={{ marginLeft: "auto" }}>
              why each was asked, and how your answer measured up
            </span>
          </div>
          <QuestionBreakdown turns={turns} />
        </section>
      )}
    </div>
  );
}
