/**
 * Session handling.
 *
 * The JWT lives in localStorage (read by `request()` for the Authorization header) and is
 * mirrored into a cookie so `proxy.ts` can gate protected routes on the server, before any
 * client JS runs. The cookie is readable by JS, so it is not a security boundary — the real
 * enforcement is the API, which requires a valid token on every interview route.
 */
const KEY = "ip_token";

function payload(token: string): { exp?: number } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export const expiresAt = (token: string): number | null => {
  const exp = payload(token)?.exp;
  return exp ? exp * 1000 : null;
};

export const isExpired = (token: string): boolean => {
  const at = expiresAt(token);
  return at !== null && at <= Date.now();
};

export function setToken(token: string) {
  try { localStorage.setItem(KEY, token); } catch {}
  const at = expiresAt(token);
  const maxAge = at ? Math.max(0, Math.round((at - Date.now()) / 1000)) : 86400;
  document.cookie = `${KEY}=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function clearToken() {
  try { localStorage.removeItem(KEY); } catch {}
  if (typeof document !== "undefined") document.cookie = `${KEY}=; path=/; max-age=0; SameSite=Lax`;
}

/** The active token, or null when missing or expired (an expired one is cleared). */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  let token: string | null = null;
  try { token = localStorage.getItem(KEY); } catch { return null; }
  if (!token) return null;
  if (isExpired(token)) { clearToken(); return null; }
  return token;
}

/** Send the visitor to sign-in, remembering where they were headed. */
export function toLogin(from?: string) {
  const next = from && from !== "/login" ? `?next=${encodeURIComponent(from)}` : "";
  window.location.replace(`/login${next}`);
}
