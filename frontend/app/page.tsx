import type { Metadata } from "next";
import Link from "next/link";
import GrowthChart from "@/components/GrowthChart";
import HeroDemo from "@/components/HeroDemo";
import { ArrowRight, Branch, Chart, Clock, Shield, Sparkle, Target, Waveform } from "@/components/Icons";
import Reveal from "@/components/Reveal";
import SystemFlow from "@/components/SystemFlow";

export const metadata: Metadata = {
  title: "Interview Prep — practise the interview before it counts",
  description:
    "Upload your resume and a job description, then practise with an AI interviewer that asks questions built for your background, follows up when an answer is thin, and scores you against what each question was looking for.",
};

const FEATURES = [
  { icon: <Target width={20} height={20} />,   title: "Questions from your resume",  body: "Your background and the job description decide what gets asked. No generic bank — a React project on your CV leads to React questions at your level." },
  { icon: <Branch width={20} height={20} />,   title: "Follow-ups when you're vague", body: "Every question carries the private signals a strong answer must show. Miss one and the interviewer probes that exact gap, the way a real one would." },
  { icon: <Waveform width={20} height={20} />, title: "Answer out loud",              body: "Speak your answer and it is transcribed for you to edit before sending. Have questions read aloud to rehearse under something closer to real conditions." },
  { icon: <Chart width={20} height={20} />,    title: "Scored, not vibes",            body: "Scores are computed from what each answer covered vs. what a strong one had to show — never invented by the model — so progress actually means something." },
  { icon: <Shield width={20} height={20} />,   title: "Private to you",               body: "Your resume and transcripts sit behind your own account. Nothing is shared, and every interview is scoped to the person who created it." },
  { icon: <Clock width={20} height={20} />,    title: "Stop and resume",              body: "Interviews are checkpointed server-side. Close the tab mid-question and pick up exactly where you left off." },
];

export default function Landing() {
  return (
    <>
      {/* ===== Hero =============================================================== */}
      <section className="lp-hero">
        <div className="lp-orbit" aria-hidden><span /><span /><span /></div>

        <div className="lp-hero-in">
          <div>
            <span className="pill rise d1"><b>New</b> Whiteboard for system-design questions</span>
            <h1 className="lp-h1 rise d2">
              Rehearse the interview <em>before it counts.</em>
            </h1>
            <p className="lp-sub rise d3">
              Upload your resume, add the role you are targeting, and practise with an interviewer
              that asks what a real one would — then tells you exactly where your answers fell short.
            </p>
            <div className="lp-cta rise d4">
              <Link href="/register" className="btn lg">Create your account <ArrowRight /></Link>
              <a href="#how" className="btn lg outline">See how it works</a>
            </div>
            <div className="lp-trust rise d5">
              <span><Shield width={15} height={15} /> Free to start</span>
              <span><Clock width={15} height={15} /> First question in ~15 seconds</span>
              <span><Sparkle width={15} height={15} /> Scored by criteria, not vibes</span>
            </div>
          </div>

          <div className="rise d3" aria-hidden="true">
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* ===== How it works: the live system flow ============================== */}
      <section className="lp-sec lp-flow" id="how">
        <Reveal>
          <div className="lp-sec-head lp-sec-head-center">
            <span className="eyebrow">How it works</span>
            <h2 className="display">How your interview is built, run and scored</h2>
            <p>
              Every interview runs through the same pipeline. Follow one run step by step, or pick
              any step to see exactly what the AI receives and what it hands to the next stage.
            </p>
          </div>
          <div className="sf-meta">
            <span><Clock width={14} height={14} /> About 20 minutes</span>
            <span><Branch width={14} height={14} /> Up to 2 follow-ups per question</span>
            <span><Waveform width={14} height={14} /> Type, speak or sketch</span>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <SystemFlow />
        </Reveal>
      </section>

      {/* ===== Features grid ===================================================== */}
      <section className="lp-sec" id="features">
        <Reveal>
          <div className="lp-sec-head">
            <span className="eyebrow">Why it works</span>
            <h2 className="display" style={{ marginTop: 8 }}>Practice that behaves like the real thing</h2>
            <p>
              Most practice tools hand you a list of questions. This one reads your background,
              decides what to probe, and holds you to a standard for each answer.
            </p>
          </div>
        </Reveal>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 70}>
              <article className="feat">
                <div className="ico">{f.icon}</div>
                <h4>{f.title}</h4>
                <p>{f.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== Growth chart ====================================================== */}
      <section className="lp-growth-band">
        <div className="lp-sec lp-growth">
          <div className="lp-growth-copy">
            <Reveal>
              <span className="eyebrow">Improvement</span>
              <h2 className="display" style={{ marginTop: 8 }}>You can see the practice working</h2>
              <p>
                Because every question is graded against explicit criteria, the same topic across two
                sessions is directly comparable. A rolling view of your scores makes the trend visible
                and shows you which topics still need work.
              </p>
              <ul className="lp-growth-list">
                <li><b>Objective:</b> the LLM writes the narrative; the numbers come from what you covered.</li>
                <li><b>Per-topic:</b> React went up, but system design is still dragging you down.</li>
                <li><b>Repeatable:</b> re-run a focus prompt whenever you want to re-measure.</li>
              </ul>
            </Reveal>
          </div>
          <div className="lp-growth-viz">
            <Reveal delay={120}><GrowthChart /></Reveal>
          </div>
        </div>
      </section>

      {/* ===== Final CTA ========================================================= */}
      <section className="lp-final">
        <Reveal>
          <div className="inner">
            <h2 className="display">Your next interview is the one that counts.</h2>
            <p className="muted" style={{ fontSize: "1.02rem" }}>
              Practise it first. Create an account and run your first interview in a couple of minutes.
            </p>
            <div className="lp-cta" style={{ justifyContent: "center" }}>
              <Link href="/register" className="btn lg">Create your account <ArrowRight /></Link>
              <Link href="/login" className="btn lg outline">I already have one</Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-in">
          <span>Interview Prep</span>
          <span>Built with LangGraph, MCP and Groq.</span>
        </div>
      </footer>
    </>
  );
}
