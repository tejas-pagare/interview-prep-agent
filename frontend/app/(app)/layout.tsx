import type { ReactNode } from "react";
import AuthGuard from "@/components/AuthGuard";

/** Every page in this group requires a signed-in visitor. */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
