"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ApiError, isOffline, request } from "@/lib/api";
import { getToken, setToken } from "@/lib/auth";

const STEPS = [
  ["01", "Upload", "Your resume and, if you have it, the job description."],
  ["02", "Practice", "Questions chosen for your background — with follow-ups when an answer is thin."],
  ["03", "Review", "A scored report showing exactly which signals you missed."],
];

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isLogin = mode === "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) { router.replace("/dashboard"); return; }
    if (new URLSearchParams(window.location.search).get("expired")) {
      setNote("Your session expired. Please sign in again.");
    }
  }, [router]);

  /** Keep ?next= when moving between sign in and create account. */
  const other = () => {
    const next = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
    const q = next ? `?next=${encodeURIComponent(next)}` : "";
    return `${isLogin ? "/register" : "/login"}${q}`;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isLogin && password !== confirm) return setError("Those passwords do not match.");
    setBusy(true);
    setError("");
    try {
      const { access_token } = await request<{ access_token: string }>(`/auth/${mode}`, {
        method: "POST", body: JSON.stringify({ email: email.trim(), password }),
      });
      setToken(access_token);
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    } catch (err) {
      if (isOffline(err)) setError((err as ApiError).message);
      else if (err instanceof ApiError && err.status === 409)
        setError("That email is already registered — sign in instead.");
      else if (err instanceof ApiError && err.status === 401)
        setError("That email and password do not match an account.");
      else setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-art">
        <blockquote className="display">Rehearse the interview before it counts.</blockquote>
        <ul>
          {STEPS.map(([n, t, d]) => (
            <li key={n}><span className="n">{n}</span><span><b>{t}.</b> {d}</span></li>
          ))}
        </ul>
      </section>

      <section className="auth-form">
        <form onSubmit={submit}>
          <div className="seg" role="radiogroup" aria-label="Sign in or create an account" style={{ marginBottom: 26 }}>
            <Link href="/login" role="radio" aria-checked={isLogin}>Sign in</Link>
            <Link href="/register" role="radio" aria-checked={!isLogin}>Create account</Link>
          </div>

          <h1 className="display" style={{ fontSize: "1.9rem" }}>
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="muted small">
            {isLogin ? "Sign in to pick up where you left off." : "Takes a moment — no card needed."}
          </p>

          {note && <p className="small faint" style={{ marginTop: 14 }}>{note}</p>}

          <label className="field">
            <span className="lbl">Email</span>
            <input type="email" autoComplete="email" required value={email}
                   onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>

          <label className="field">
            <span className="lbl">Password {!isLogin && <span className="opt">— at least 8 characters</span>}</span>
            <input type="password" autoComplete={isLogin ? "current-password" : "new-password"}
                   required minLength={8} maxLength={72} value={password}
                   onChange={(e) => setPassword(e.target.value)} />
          </label>

          {!isLogin && (
            <label className="field">
              <span className="lbl">Confirm password</span>
              <input type="password" autoComplete="new-password" required minLength={8} maxLength={72}
                     value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          )}

          {error && (
            <div className="notice" role="alert" style={{ marginTop: 18 }}>
              <span>{error}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setError("")}>×</button>
            </div>
          )}

          <button className="btn lg block" style={{ marginTop: 24 }} disabled={busy}>
            {busy
              ? <><span className="spin" />{isLogin ? "Signing in…" : "Creating account…"}</>
              : isLogin ? "Sign in" : "Create account"}
          </button>

          <p className="small muted" style={{ textAlign: "center", margin: "18px 0 0" }}>
            {isLogin ? "No account yet? " : "Already registered? "}
            <Link href={other()}>{isLogin ? "Create one" : "Sign in"}</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
