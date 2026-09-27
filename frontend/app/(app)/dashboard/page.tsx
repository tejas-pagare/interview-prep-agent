"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Dropzone from "@/components/Dropzone";
import { ArrowRight } from "@/components/Icons";
import { band } from "@/components/ScoreRing";
import { ApiError, getToken, InterviewState, InterviewSummary, request } from "@/lib/api";

const AREAS = ["Frontend", "Backend", "Full-stack", "System design", "Databases", "Data structures", "DevOps", "Behavioral"];
const LENGTHS = [3, 5, 8, 10];

export default function Dashboard() {
  const router = useRouter();
  const [history, setHistory] = useState<InterviewSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState("");
  const [length, setLength] = useState(5);

  useEffect(() => {
    if (!getToken()) return router.replace("/login");
    request<InterviewSummary[]>("/interviews").then(setHistory).catch((e) => {
      if (e instanceof ApiError && e.status === 401) router.replace("/login");
      else { setError(e.message); setHistory([]); }
    });
  }, [router]);

  const stats = useMemo(() => {
    const scored = (history ?? []).filter((h) => h.overall_score != null).map((h) => h.overall_score as number);
    const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    return {
      total: history?.length ?? 0,
      done: scored.length,
      avg: avg == null ? "—" : avg.toFixed(1),
      best: scored.length ? Math.max(...scored).toFixed(1) : "—",
    };
  }, [history]);

  const on = (a: string) => focus.toLowerCase().includes(a.toLowerCase());
  const toggle = (a: string) =>
    setFocus((f) => (on(a) ? f.split(",").map((s) => s.trim()).filter((s) => s.toLowerCase() !== a.toLowerCase()).join(", ")
                          : f.trim() ? `${f.trim()}, ${a}` : a));

  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const iv = await request<InterviewState>("/interviews", { method: "POST", body: new FormData(e.currentTarget) });
      router.push(`/interview/${iv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the interview");
      setBusy(false);
    }
  }

  return (
    <main className="wrap stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1 className="display" style={{ margin: "6px 0 0" }}>Practice interviews</h1>
          <p className="muted">Built from your resume and the role you are aiming for.</p>
        </div>
      </div>

      <div className="metrics">
        {([["Interviews", stats.total], ["Completed", stats.done], ["Average", stats.avg], ["Best", stats.best]] as const).map(([k, v]) => (
          <div key={k}>
            {history ? <div className="v num">{v}</div> : <div className="sk" style={{ height: 30, width: 48 }} />}
            <div className="k">{k}</div>
          </div>
        ))}
      </div>

      <div className="split">
        <form onSubmit={start}>
          <h3>New interview</h3>
          <div className="field" style={{ marginTop: 14 }}>
            <span className="lbl">Resume</span>
            <Dropzone name="resume" />
          </div>

          <label className="field">
            <span className="lbl">Focus areas <span className="opt">— optional</span></span>
            <input type="text" name="focus_prompt" maxLength={2000} value={focus}
                   onChange={(e) => setFocus(e.target.value)} placeholder="React performance, REST API design…" />
          </label>
          <div className="tags" role="group" aria-label="Suggested focus areas">
            {AREAS.map((a) => (
              <button type="button" key={a} className="tag" aria-pressed={on(a)} onClick={() => toggle(a)}>{a}</button>
            ))}
          </div>

          <label className="field">
            <span className="lbl">Job description <span className="opt">— optional, makes questions role-specific</span></span>
            <textarea name="jd_text" maxLength={20000} placeholder="Paste the posting you are preparing for" />
          </label>

          <div className="field">
            <span className="lbl" id="len">Questions</span>
            <div className="seg" role="radiogroup" aria-labelledby="len">
              {LENGTHS.map((n) => (
                <button type="button" key={n} role="radio" aria-checked={length === n} onClick={() => setLength(n)}>{n}</button>
              ))}
            </div>
            <input type="hidden" name="num_questions" value={length} />
          </div>

          {error && (
            <div className="notice" role="alert" style={{ marginTop: 20 }}>
              {error}<button type="button" aria-label="Dismiss" onClick={() => setError("")}>×</button>
            </div>
          )}

          <div className="row" style={{ marginTop: 26 }}>
            <button className="btn lg" disabled={busy}>
              {busy ? <><span className="spin" />Preparing…</> : <>Begin interview <ArrowRight /></>}
            </button>
            {busy && <span className="small faint">Reading your resume and planning questions — about 15 seconds.</span>}
          </div>
        </form>

        <section>
          <h3>Previous</h3>
          <div className="items" style={{ marginTop: 14 }}>
            {history === null && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 40, margin: "8px 0" }} />)}
            {history?.length === 0 && <p className="blank small">Nothing yet. Your interviews will be listed here.</p>}
            {history?.map((h) => (
              <Link key={h.id} href={`/interview/${h.id}`}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ttl" style={{ display: "block" }}>{h.title}</span>
                  <span className="small faint">
                    {new Date(h.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {h.num_questions} questions
                  </span>
                </span>
                {h.overall_score != null
                  ? <span className={`sc ${band(h.overall_score)} num`}>{h.overall_score.toFixed(1)}</span>
                  : <span className="dotstat">In progress</span>}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
