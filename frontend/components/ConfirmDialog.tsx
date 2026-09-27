"use client";
import { ReactNode, useEffect, useRef } from "react";

/** A modal confirm built on native <dialog>: focus trapping, Esc and the backdrop come free. */
export default function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = "Cancel", tone = "warn", onConfirm, onCancel }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string;
  tone?: "warn" | "brand"; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="confirm" aria-labelledby="confirm-title"
            onCancel={(e) => { e.preventDefault(); onCancel(); }}
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-in">
        <h2 id="confirm-title" className="display">{title}</h2>
        <div className="muted small">{children}</div>
        <div className="row confirm-bar">
          <button className="btn plain" onClick={onCancel} autoFocus>{cancelLabel}</button>
          <button className={`btn ${tone === "warn" ? "warn" : ""}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
