import { clearToken, getToken, toLogin } from "./auth";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export { clearToken, getToken, setToken } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** status 0 means the request never reached the API. */
export const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0;

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${API}. Start the backend, then try again.`);
  }

  if (!res.ok) {
    // An expired or invalid session: drop it and bounce to sign-in. Failed sign-in
    // attempts return 401 too, so those are left for the form to report.
    if (res.status === 401 && !path.startsWith("/auth/")) {
      clearToken();
      if (typeof window !== "undefined") toLogin(window.location.pathname);
      throw new ApiError(401, "Your session has expired. Please sign in again.");
    }
    let detail = res.statusText || `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) detail = body.detail[0].msg;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export type DiagramNode = { id: string; label: string; x: number; y: number };
export type DiagramEdge = { id: string; from: string; to: string; label?: string };
export type Diagram = { nodes: DiagramNode[]; edges: DiagramEdge[] };
/** How the candidate should answer this question. Diagram mode shows a whiteboard alongside the prose box. */
export type AnswerMode = "text" | "diagram";
export type Question = {
  kind: "question" | "followup"; topic: string; question: string;
  answer_mode?: AnswerMode;
  /** A short line naming what to draw, present when answer_mode is 'diagram'. */
  canvas_hint?: string | null;
};
export type Feedback = { score: number; satisfied: boolean; feedback: string };
export type Turn = {
  kind: string; topic: string; question: string; answer: string;
  score: number; satisfied: boolean; feedback: string;
  /** Why this question was chosen for this candidate. */
  rationale?: string;
  /** What a satisfying answer had to demonstrate, and which of those landed. */
  expected_signals?: string[];
  signals_met?: string[];
  signals_missed?: string[];
  answer_mode?: AnswerMode;
  canvas_hint?: string | null;
  /** The candidate's whiteboard, when this turn was a diagram question. */
  diagram?: Diagram | null;
};
export type Report = {
  overall_score: number; topic_scores: { topic: string; score: number }[];
  strengths: string[]; gaps: string[]; recommendations: string[]; summary: string;
};
export type InterviewState = {
  id: string; status: "active" | "completed"; title?: string; question: Question | null;
  progress: { answered_main: number; total: number }; needs_retry: boolean;
  report: Report | null; turns?: Turn[]; feedback?: Feedback;
};
export type InterviewSummary = {
  id: string; title: string; status: string; overall_score: number | null;
  num_questions: number; created_at: string;
};
