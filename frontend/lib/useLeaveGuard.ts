"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "./auth";

/** Marks the extra history entry we push so the Back button can be intercepted. */
const MARK = "__leaveGuard";
type Pending = { kind: "link"; href: string } | { kind: "back" };

/**
 * Asks before the visitor leaves the current page while `active` is true.
 *
 * The App Router has no "route change" event to cancel, so each way out is covered separately:
 * - closing / reloading the tab: `beforeunload` (the browser shows its own generic prompt);
 * - in-app links (`<Link>` and plain `<a>`, including the top nav): a capture-phase click
 *   listener on `document` runs before React's handlers, so the navigation never starts;
 * - the Back button: a duplicate history entry is pushed on arrival, so Back lands on the
 *   same URL and we can re-push it and ask instead of leaving.
 *
 * Programmatic navigation (`router.push`, the 401 bounce to sign-in) is not intercepted.
 * Render a dialog when `pending` is set, and wire it to `confirm` / `cancel`.
 */
export function useLeaveGuard(active: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const bypass = useRef(false);

  useEffect(() => {
    if (!active) return;
    bypass.current = false;

    const onUnload = (e: BeforeUnloadEvent) => {
      // No session means we are being bounced to sign-in, which should not prompt.
      if (bypass.current || !getToken()) return;
      e.preventDefault();
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      if (bypass.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // opens a new tab/window
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return; // external: beforeunload covers it
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / hash
      e.preventDefault();
      e.stopPropagation();
      setPending({ kind: "link", href: url.pathname + url.search + url.hash });
    };

    const onPop = () => {
      if (bypass.current || history.state?.[MARK]) return;
      // Back took us off our guard entry onto the same URL: put it back and ask.
      history.pushState({ ...history.state, [MARK]: true }, "", location.href);
      setPending({ kind: "back" });
    };

    if (!history.state?.[MARK]) history.pushState({ ...history.state, [MARK]: true }, "", location.href);
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [active]);

  const confirm = useCallback(() => {
    if (!pending) return;
    bypass.current = true;
    setPending(null);
    if (pending.kind === "link") router.push(pending.href);
    else history.go(-2); // step over our guard entry and the page's own entry
  }, [pending, router]);

  const cancel = useCallback(() => setPending(null), []);

  return { pending: pending !== null, confirm, cancel };
}
