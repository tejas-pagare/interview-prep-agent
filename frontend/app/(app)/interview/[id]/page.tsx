"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DiagramCanvas, { Diagram } from "@/components/DiagramCanvas";
import { ArrowLeft, Mic, Printer, Sketch, Sound, Square, Tick } from "@/components/Icons";
import ReportView from "@/components/ReportView";
import { band } from "@/components/ScoreRing";
import { API, ApiError, getToken, InterviewState, request, Turn } from "@/lib/api";
import { useLeaveGuard } from "@/lib/useLeaveGuard";

const EMPTY_DIAGRAM: Diagram = { nodes: [], edges: [] };

const Thinking = ({ label }: { label: string }) => (
  <p className="row small faint" style={{ margin: 0 }} role="status">
    <span className="dots"><i /><i /><i /></span> {label}
  </p>
);

export default function Room() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [iv, setIv] = useState<InterviewState | null>(null);
  const [answer, setAnswer] = useState("");
  const [sent, setSent] = useState<string | null>(null); // shown optimistically while grading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [askEnd, setAskEnd] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  // Per-question draft of the whiteboard. Keyed by the question text so that switching to
  // a follow-up (which is always text) doesn't carry the previous diagram along, and coming
  // back to the same question restores the draft.
  const [diagrams, setDiagrams] = useState<Record<string, Diagram>>({});
  const recorder = useRef<MediaRecorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const speech = useRef<{ gen: number; abort: AbortController | null; url: string | null }>({ gen: 0, abort: null, url: null });
  const foot = useRef<HTMLDivElement | null>(null);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return router.replace("/login");
    setError(e instanceof Error ? e.message : "Something went wrong");
  }, [router]);

  const load = useCallback(async () => {
    try { setIv(await request<InterviewState>(`/interviews/${id}`)); } catch (e) { fail(e); }
  }, [id, fail]);

  useEffect(() => {
    if (!getToken()) return router.replace("/login");
    load();
  }, [load, router]);

  useEffect(() => { foot.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); },
    [iv?.turns?.length, iv?.question?.question, sent]);

  // Silence any speech, including a request still in flight: every call bumps `gen`, and a
  // speak() that finds its generation stale drops its audio instead of playing it late.
  const stopSpeech = useCallback(() => {
    const s = speech.current;
    s.gen++;
    s.abort?.abort();
    s.abort = null;
    if (player.current) { player.current.pause(); player.current.removeAttribute("src"); player.current = null; }
    if (s.url) { URL.revokeObjectURL(s.url); s.url = null; }
    window.speechSynthesis?.cancel();
  }, []);

  // voice out — server TTS, falling back to the browser voice
  const speak = useCallback(async (text: string) => {
    stopSpeech();
    const s = speech.current;
    const gen = s.gen;
    const ctrl = new AbortController();
    s.abort = ctrl;
    try {
      const res = await fetch(`${API}/voice/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ text: text.slice(0, 1000) }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("unavailable");
      const blob = await res.blob();
      if (gen !== s.gen) return;
      s.url = URL.createObjectURL(blob);
      const el = new Audio(s.url);
      player.current = el;
      el.onended = () => { if (gen === s.gen) stopSpeech(); };
      await el.play();
    } catch {
      if (gen !== s.gen) return; // stopped or superseded, not a TTS failure
      if (window.speechSynthesis) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }, [stopSpeech]);

  const question = iv?.question?.question;
  useEffect(() => { if (readAloud && question) speak(question); }, [readAloud, question, speak]);
  useEffect(() => stopSpeech, [stopSpeech]);

  // Warn before leaving an interview that is still running (it is saved, but a draft is not).
  const leave = useLeaveGuard(!!iv && iv.status !== "completed");

  // voice in — record, transcribe, then let them edit before sending
  async function toggleRec() {
    if (recording) return recorder.current?.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", new Blob(chunks, { type: rec.mimeType }), "answer.webm");
          const { text } = await request<{ text: string }>("/voice/transcribe", { method: "POST", body: form });
          setAnswer((p) => (p ? `${p} ${text}` : text).trim());
        } catch (e) { fail(e); } finally { setTranscribing(false); }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("No microphone access. You can still type your answer.");
    }
  }

  async function act(path: string, body?: object) {
    setBusy(true);
    setError("");
    setAskEnd(false);
    if (body && "answer" in body) setSent((body as { answer: string }).answer);
    try {
      await request(`/interviews/${id}${path}`, { method: "POST", body: body && JSON.stringify(body) });
      setAnswer("");
    } catch (e) { fail(e); }
    await load();
    setSent(null);
    setBusy(false);
  }

  const q = iv?.question;
  const key = q?.question ?? "";
  const draft = diagrams[key] ?? EMPTY_DIAGRAM;
  const hasDrawn = draft.nodes.length > 0 || draft.edges.length > 0;
  // A candidate can always opt into a canvas, even on a text question. Once they have drawn
  // anything, we stay in canvas mode until they leave the question.
  const [manualSketch, setManualSketch] = useState<Record<string, boolean>>({});
  const autoSketch = q?.answer_mode === "diagram";
  const showCanvas = !!q && (autoSketch || manualSketch[key] || hasDrawn);
  // A canvas question is OK with either prose or a drawing; a plain text question still needs prose.
  const canSend = showCanvas ? (answer.trim().length > 0 || hasDrawn) : answer.trim().length > 0;

  const send = () => {
    if (!canSend || busy) return;
    const body: { answer: string; diagram?: Diagram } = { answer: answer.trim() };
    if (showCanvas && hasDrawn) body.diagram = draft;
    act("/answer", body);
  };
  const keys = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } };

  if (!iv) return (
    <main className="wrap narrow stack">
      {error ? <div className="notice" role="alert">{error}</div>
             : <><div className="sk" style={{ height: 28, width: 220 }} /><div className="sk" style={{ height: 120 }} /><div className="sk" style={{ height: 160 }} /></>}
    </main>
  );

  const turns: Turn[] = iv.turns ?? [];
  const done = iv.status === "completed";
  const answered = iv.progress.answered_main;

  if (done && iv.report) {
    return (
      <main className="wrap narrow stack">
        <div className="page-head">
          <div>
            <Link href="/dashboard" className="row small faint no-print" style={{ gap: 6, textDecoration: "none" }}><ArrowLeft width={14} height={14} /> Dashboard</Link>
            <h1 className="display" style={{ margin: "8px 0 0", fontSize: "2.1rem" }}>{iv.title}</h1>
            <p className="muted small" style={{ margin: "2px 0 0" }}>{turns.length} answers · {iv.progress.total} planned questions</p>
          </div>
          <button className="btn outline no-print" onClick={() => window.print()}><Printer /> Print</button>
        </div>
        <ReportView report={iv.report} turns={turns} />
        <div className="no-print"><Link className="btn" href="/dashboard">Start another interview</Link></div>
      </main>
    );
  }

  return (
    <main className="wrap room">
      <ConfirmDialog open={leave.pending} title="Leave this interview?" confirmLabel="Leave interview"
                     cancelLabel="Keep going" onConfirm={() => { stopSpeech(); leave.confirm(); }} onCancel={leave.cancel}>
        <p>Your submitted answers are saved and you can resume from the dashboard.
          {answer.trim() ? " The answer you are typing has not been submitted and will be lost." : ""}</p>
      </ConfirmDialog>
      <div className="stack">
        <div>
          <Link href="/dashboard" className="row small faint" style={{ gap: 6, textDecoration: "none" }}><ArrowLeft width={14} height={14} /> Dashboard</Link>
          <h1 className="display" style={{ margin: "8px 0 0", fontSize: "1.55rem" }}>{iv.title}</h1>
        </div>

        {turns.length > 0 && (
          <section className="log">
            {turns.map((t, i) => (
              <article className="entry" key={i}>
                <div className="small faint">{t.kind === "followup" ? "Follow-up" : `Question ${i + 1}`} · {t.topic}</div>
                <p className="q">{t.question}</p>
                <p className="a">{t.answer}</p>
                <div className="fb">
                  <span className={`sc ${band(t.score)} num`}>{t.score}</span>
                  <span>{t.feedback}</span>
                </div>
              </article>
            ))}
          </section>
        )}

        {sent && (
          <article className="entry">
            <p className="a" style={{ margin: 0 }}>{sent}</p>
            {busy && <div style={{ marginTop: 14 }}><Thinking label="Grading your answer…" /></div>}
          </article>
        )}

        {!sent && busy && <Thinking label="Writing your report…" />}

        {!busy && iv.question && (
          <section className="ask">
            <div className="meta small faint">
              <span>{iv.question.kind === "followup" ? "Follow-up" : `Question ${answered + 1} of ${iv.progress.total}`}</span>
              <span>·</span><span>{iv.question.topic}</span>
              {autoSketch && <><span>·</span><span className="row" style={{ gap: 4, color: "var(--brand)" }}><Sketch width={13} height={13} /> Whiteboard question</span></>}
              <button className="btn plain" style={{ padding: "2px 8px" }} onClick={() => speak(iv.question!.question)}>
                <Sound width={14} height={14} /> Listen
              </button>
            </div>
            <p className="q">{iv.question.question}</p>
          </section>
        )}

        {!busy && iv.question && showCanvas && (
          <DiagramCanvas
            resetKey={`${iv.id}:${key}`}
            hint={iv.question.canvas_hint ?? (autoSketch ? null : "your own sketch — components and how they connect")}
            value={draft}
            onChange={(next) => setDiagrams((all) => ({ ...all, [key]: next }))}
          />
        )}

        {error && <div className="notice" role="alert">{error}<button aria-label="Dismiss" onClick={() => setError("")}>×</button></div>}

        {iv.needs_retry && (
          <div className="panel"><div className="pad row">
            <span className="small">The AI provider failed on that step — your progress is saved.</span>
            <span className="grow" />
            <button className="btn" disabled={busy} onClick={() => act("/retry")}>{busy ? "Retrying…" : "Retry"}</button>
          </div></div>
        )}

        {iv.question && !iv.needs_retry && !busy && (
          <div className="compose">
            <label className="sr-only" htmlFor="ans">Your answer</label>
            <textarea id="ans" value={answer} maxLength={10000} onChange={(e) => setAnswer(e.target.value)} onKeyDown={keys}
                      placeholder={showCanvas
                        ? "Walk through your diagram — trade-offs, why these components, where they scale."
                        : "Talk through your answer — say how you would approach it, not only the conclusion."} />
            <div className="bar">
              <button className="btn" disabled={!canSend} onClick={send}>Submit</button>
              <button className={`btn ${recording ? "live" : "outline"}`} disabled={transcribing} onClick={toggleRec}>
                {recording ? <>Stop <Square width={13} height={13} /></> : transcribing ? <><span className="spin" />Transcribing…</> : <><Mic /> Record</>}
              </button>
              {!autoSketch && (
                <button
                  type="button"
                  className="btn toggle"
                  aria-pressed={showCanvas}
                  disabled={showCanvas && hasDrawn}
                  onClick={() => setManualSketch((m) => ({ ...m, [key]: !showCanvas }))}
                  title={showCanvas
                    ? (hasDrawn ? "Delete every box to hide the whiteboard" : "Hide the whiteboard")
                    : "Open a whiteboard alongside your answer"}
                >
                  <Sketch width={14} height={14} /> {showCanvas ? "Whiteboard on" : "Whiteboard"}
                </button>
              )}
              <label className="check"><input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} /> Read aloud</label>
              <span className="grow" />
              <span className="small faint num">{answer.length.toLocaleString()} / 10,000</span>
              <span className="small faint"><kbd>⌘</kbd> <kbd>↵</kbd></span>
            </div>
          </div>
        )}
        <div ref={foot} />
      </div>

      <aside className="rail no-print">
        <div>
          <div className="row small" style={{ justifyContent: "space-between", marginBottom: 9 }}>
            <span className="eyebrow">Progress</span>
            <span className="faint num">{answered} / {iv.progress.total}</span>
          </div>
          <div className="meter"><div style={{ width: `${(answered / iv.progress.total) * 100}%` }} /></div>
          <ul className="track" style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
            {Array.from({ length: iv.progress.total }, (_, i) => {
              const state = i < answered ? "done" : i === answered ? "now" : "";
              return (
                <li key={i} className={state}>
                  <span className="ix">{state === "done" ? <Tick width={11} height={11} strokeWidth={2.6} /> : i + 1}</span>
                  Question {i + 1}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <span className="eyebrow">Answering well</span>
          <ul className="bullets muted" style={{ marginTop: 10 }}>
            <li>Lead with a concrete example from your own work.</li>
            <li>Say why, not only what.</li>
            <li>A follow-up is normal — it means one signal was missing.</li>
          </ul>
        </div>

        <div>
          {askEnd ? (
            <div className="stack tight">
              <p className="small" style={{ margin: 0 }}>
                End now and grade the {turns.length} answer{turns.length === 1 ? "" : "s"} you have given?
              </p>
              <div className="row">
                <button className="btn warn" disabled={busy} onClick={() => act("/finish")}>End interview</button>
                <button className="btn plain" onClick={() => setAskEnd(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn outline block" disabled={busy || turns.length === 0} onClick={() => setAskEnd(true)}
                    title={turns.length === 0 ? "Answer at least one question first" : ""}>
              End &amp; get report
            </button>
          )}
        </div>
      </aside>
    </main>
  );
}
