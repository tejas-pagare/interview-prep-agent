"use client";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { clearToken, expiresAt, getToken } from "@/lib/auth";

/**
 * Client-side half of route protection: nothing renders until a valid, unexpired token is
 * confirmed, so protected content never flashes. It also signs the visitor out the moment
 * their token expires while the tab is open.
 */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      clearToken();
      router.replace(`/login?next=${encodeURIComponent(path)}`);
      return;
    }
    setAllowed(true);

    const at = expiresAt(token);
    if (at === null) return;
    const timer = setTimeout(() => {
      clearToken();
      router.replace(`/login?next=${encodeURIComponent(path)}&expired=1`);
    }, Math.max(0, at - Date.now()));
    return () => clearTimeout(timer);
  }, [router, path]);

  if (!allowed) {
    return (
      <main className="wrap stack" aria-busy="true">
        <div className="sk" style={{ height: 30, width: 200 }} />
        <div className="sk" style={{ height: 92 }} />
        <div className="sk" style={{ height: 320 }} />
      </main>
    );
  }
  return <>{children}</>;
}
