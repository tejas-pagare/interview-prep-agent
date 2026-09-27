"use client";
import { DragEvent, useRef, useState } from "react";
import { Doc, Upload } from "./Icons";

const OK = [".pdf", ".docx", ".txt", ".md"];
const MAX_MB = 5;

export default function Dropzone({ name }: { name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");

  function take(f?: File | null) {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!OK.includes(ext)) return setErr("Upload a PDF, DOCX or TXT file.");
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`That file is over ${MAX_MB} MB.`);
    setErr("");
    setFile(f);
    if (input.current) { const dt = new DataTransfer(); dt.items.add(f); input.current.files = dt.files; }
  }

  return (
    <div>
      <button type="button" className={`drop ${over ? "over" : ""} ${file ? "has" : ""}`}
              onClick={() => input.current?.click()}
              onDragOver={(e: DragEvent) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}>
        <span className="row" style={{ gap: 13, flexWrap: "nowrap" }}>
          {file ? <Doc width={19} height={19} /> : <Upload width={19} height={19} />}
          <span>
            <span className="t">{file ? file.name : "Choose a resume, or drop one here"}</span>
            <span className="small faint" style={{ display: "block", marginTop: 2 }}>
              {file ? `${(file.size / 1024).toFixed(0)} KB · click to replace` : `PDF, DOCX or TXT · up to ${MAX_MB} MB`}
            </span>
          </span>
        </span>
        <input ref={input} className="sr-only" tabIndex={-1} type="file" name={name} accept={OK.join(",")} required
               onChange={(e) => take(e.target.files?.[0])} />
      </button>
      {err && <p className="small" role="alert" style={{ color: "var(--neg)", margin: "8px 0 0" }}>{err}</p>}
    </div>
  );
}
