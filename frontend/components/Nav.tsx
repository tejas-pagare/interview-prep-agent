"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearToken, getToken } from "@/lib/auth";

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => setAuthed(!!getToken()), [path]);

  const onLanding = path === "/";
  const home = authed ? "/dashboard" : "/";

  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href={home} className="brand"><i />Interview&nbsp;Prep</Link>

        <nav className="navlinks">
          {authed === null && <span className="sk" style={{ height: 30, width: 150 }} />}

          {authed === false && (
            <>
              {onLanding && (
                <>
                  <a className="btn plain hide-sm" href="#features">Features</a>
                  <a className="btn plain hide-sm" href="#how">How it works</a>
                  <span className="sep hide-sm" />
                </>
              )}
              <Link href="/login" className="btn plain">Sign in</Link>
              <Link href="/register" className="btn">Create account</Link>
            </>
          )}

          {authed === true && (
            <>
              <Link href="/dashboard" className="btn plain">Dashboard</Link>
              <button className="btn plain" onClick={() => { clearToken(); setAuthed(false); router.push("/"); }}>
                Sign out
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
