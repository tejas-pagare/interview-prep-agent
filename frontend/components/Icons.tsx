import type { SVGProps } from "react";

const base = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
} as const;
type P = SVGProps<SVGSVGElement>;

export const Upload = (p: P) => <svg {...base} {...p}><path d="M12 15V4m0 0L8 8m4-4l4 4" /><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>;
export const Doc = (p: P) => <svg {...base} {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></svg>;
export const Mic = (p: P) => <svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>;
export const Square = (p: P) => <svg {...base} {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>;
export const Sound = (p: P) => <svg {...base} {...p}><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 9a4 4 0 010 6" /><path d="M18.5 6a8 8 0 010 12" /></svg>;
export const Tick = (p: P) => <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const Chevron = (p: P) => <svg {...base} {...p}><path d="M9 6l6 6-6 6" /></svg>;
export const ArrowRight = (p: P) => <svg {...base} {...p}><path d="M5 12h13m-5-6l6 6-6 6" /></svg>;
export const ArrowLeft = (p: P) => <svg {...base} {...p}><path d="M19 12H6m5-6l-6 6 6 6" /></svg>;
export const Printer = (p: P) => <svg {...base} {...p}><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="7" rx="2" /><path d="M7 14h10v7H7z" /></svg>;

export const Target = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /></svg>;
export const Branch = (p: P) => <svg {...base} {...p}><circle cx="6" cy="5" r="2.2" /><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M6 7.2v9.6M8.2 5H13a3 3 0 013 3v1.8M8.2 19H13a3 3 0 003-3v-1.8" /></svg>;
export const Waveform = (p: P) => <svg {...base} {...p}><path d="M4 11v2M8 8v8M12 5v14M16 9v6M20 11v2" /></svg>;
export const Chart = (p: P) => <svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
export const Shield = (p: P) => <svg {...base} {...p}><path d="M12 3l8 3v6c0 4.4-3.2 8-8 9-4.8-1-8-4.6-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>;
export const Clock = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const Plus = (p: P) => <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const Trash = (p: P) => <svg {...base} {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" /></svg>;
export const Sketch = (p: P) => <svg {...base} {...p}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M7 12h4m-4-4h6m-6 8h10" /></svg>;
export const Fullscreen = (p: P) => <svg {...base} {...p}><path d="M4 9V4h5M15 4h5v5M4 15v5h5M15 20h5v-5" /></svg>;
export const Minimize = (p: P) => <svg {...base} {...p}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>;
export const Close = (p: P) => <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const Cpu = (p: P) => <svg {...base} {...p}><rect x="6" y="6" width="12" height="12" rx="1.6" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2" /></svg>;
export const Chat = (p: P) => <svg {...base} {...p}><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-8l-4 4v-4H6a2 2 0 01-2-2z" /><path d="M8 10h8M8 13h5" /></svg>;
export const List = (p: P) => <svg {...base} {...p}><circle cx="4.5" cy="6" r="1.4" /><circle cx="4.5" cy="12" r="1.4" /><circle cx="4.5" cy="18" r="1.4" /><path d="M9 6h11M9 12h11M9 18h11" /></svg>;
export const Sparkle = (p: P) => <svg {...base} {...p}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>;
export const Play = (p: P) => <svg {...base} {...p}><path d="M6 4l14 8-14 8V4z" /></svg>;
export const Pause = (p: P) => <svg {...base} {...p}><path d="M8 5v14M16 5v14" /></svg>;
