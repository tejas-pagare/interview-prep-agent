"use client";
import {
  addEdge, Background, BackgroundVariant, Connection, Controls, Edge, EdgeChange,
  Handle, MarkerType, Node, NodeChange, NodeProps, Panel, Position, ReactFlow,
  ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Close, Fullscreen as FullscreenIcon, Minimize, Plus, Trash } from "./Icons";

const TIP_KEY = "diagram:fullscreen-seen";

/** The over-the-wire shape. Kept intentionally small so the backend + LLM only see what matters. */
export type DiagramNode = { id: string; label: string; x: number; y: number };
export type DiagramEdge = { id: string; from: string; to: string; label?: string };
export type Diagram = { nodes: DiagramNode[]; edges: DiagramEdge[] };

type RFNode = Node<{ label: string }, "labeled">;

const NODE_LIMIT = 60;
const EDGE_LIMIT = 200;
const LABEL_LIMIT = 120;
const ID_LIMIT = 40;
const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
    .replace(/-/g, "").slice(0, 10);

/**
 * Turn React Flow's rich state into the compact `Diagram` value the backend and the
 * evaluator LLM see. This is the single boundary: everything past this point (server,
 * database, LLM prompt) receives only these fields — never React Flow internals like
 * `selected`, `dragging`, `positionAbsolute`, custom `type`, styles, or handles.
 */
function sanitize(rfNodes: RFNode[], rfEdges: Edge[]): Diagram {
  const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  const ids = new Set<string>();
  const nodes: DiagramNode[] = [];
  for (const n of rfNodes) {
    const id = clip(n.id, ID_LIMIT);
    if (!id || ids.has(id) || nodes.length >= NODE_LIMIT) continue;
    ids.add(id);
    nodes.push({ id, label: clip(n.data?.label, LABEL_LIMIT), x: num(n.position?.x), y: num(n.position?.y) });
  }
  const edges: DiagramEdge[] = [];
  const seen = new Set<string>();
  for (const e of rfEdges) {
    const from = clip(e.source, ID_LIMIT);
    const to = clip(e.target, ID_LIMIT);
    if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) continue;
    const key = `${from}\u0000${to}`;
    if (seen.has(key) || edges.length >= EDGE_LIMIT) continue;
    seen.add(key);
    const label = typeof e.label === "string" ? clip(e.label, LABEL_LIMIT) : "";
    edges.push({ id: clip(e.id, ID_LIMIT + 20) || uid(), from, to, ...(label ? { label } : {}) });
  }
  return { nodes, edges };
}

/** Rehydrate a saved Diagram back into React Flow's shape. */
function toRf(diagram: Diagram): { nodes: RFNode[]; edges: Edge[] } {
  const nodes: RFNode[] = diagram.nodes.map((n) => ({
    id: n.id, type: "labeled", position: { x: n.x, y: n.y }, data: { label: n.label },
  }));
  const edges: Edge[] = diagram.edges.map((e) => ({
    id: e.id, source: e.from, target: e.to,
    label: e.label || undefined, type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--ink-2)" },
    style: { stroke: "var(--ink-2)", strokeWidth: 1.4 },
  }));
  return { nodes, edges };
}

/** An editable rectangle. Handles on all four sides so arrows can enter/leave from any direction. */
const LabeledNode = memo(function LabeledNode({ id, data, selected }: NodeProps<RFNode>) {
  const rf = useReactFlow<RFNode, Edge>();
  const [editing, setEditing] = useState(!data.label);
  const [draft, setDraft] = useState(data.label);

  useEffect(() => setDraft(data.label), [data.label]);

  const commit = useCallback((value: string) => {
    const next = value.slice(0, LABEL_LIMIT);
    setEditing(false);
    rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: next } } : n)));
  }, [rf, id]);

  return (
    <div className={`rf-box ${selected ? "sel" : ""}`}
         onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
      {/* One target handle per side accepting incoming arrows; one source handle per side for outgoing. */}
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((p) => (
        <Handle key={`t-${p}`} type="target" position={p} className="rf-handle" isConnectable />
      ))}
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((p) => (
        <Handle key={`s-${p}`} type="source" position={p} className="rf-handle" isConnectable />
      ))}

      {editing ? (
        <input
          autoFocus
          className="rf-input"
          value={draft}
          maxLength={LABEL_LIMIT}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft.trim())}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            else if (e.key === "Escape") { setDraft(data.label); setEditing(false); }
            e.stopPropagation(); // stop React Flow's global Backspace-deletes-selection
          }}
        />
      ) : (
        <div className={`rf-label ${!data.label ? "empty" : ""}`}>
          {data.label || "double-click to name"}
        </div>
      )}
    </div>
  );
});

const nodeTypes = { labeled: LabeledNode };

/** The actual canvas — must be a child of ReactFlowProvider to use its hooks. */
function Canvas({ value, onChange, readOnly, hint, fullscreen, onToggleFullscreen, tipVisible, onDismissTip }: {
  value: Diagram; onChange?: (next: Diagram) => void; readOnly: boolean; hint?: string | null;
  fullscreen: boolean; onToggleFullscreen: () => void;
  tipVisible: boolean; onDismissTip: () => void;
}) {
  // Convert the incoming diagram once per remount. The wrapper below gives us a fresh
  // mount whenever the parent question changes (via `key`), so no sync-loop can form
  // between React Flow's internal state and the parent's controlled value.
  const seed = useMemo(() => toRf(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(seed.edges);
  const emit = useRef<number | null>(null);

  // Emit a sanitized copy after any change. Debounced by rAF so dragging doesn't spam the parent.
  useEffect(() => {
    if (!onChange || readOnly) return;
    if (emit.current !== null) cancelAnimationFrame(emit.current);
    emit.current = requestAnimationFrame(() => onChange(sanitize(nodes, edges)));
    return () => { if (emit.current !== null) cancelAnimationFrame(emit.current); };
  }, [nodes, edges, onChange, readOnly]);

  const onNodesChangeGuarded = useCallback((changes: NodeChange<RFNode>[]) => {
    onNodesChange(readOnly ? changes.filter((c) => c.type === "select") : changes);
  }, [onNodesChange, readOnly]);
  const onEdgesChangeGuarded = useCallback((changes: EdgeChange<Edge>[]) => {
    onEdgesChange(readOnly ? changes.filter((c) => c.type === "select") : changes);
  }, [onEdgesChange, readOnly]);

  const onConnect = useCallback((c: Connection) => {
    if (readOnly || !c.source || !c.target || c.source === c.target) return;
    setEdges((eds) => {
      if (eds.some((e) => e.source === c.source && e.target === c.target)) return eds;
      return addEdge({
        ...c, id: uid(), type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--ink-2)" },
        style: { stroke: "var(--ink-2)", strokeWidth: 1.4 },
      }, eds);
    });
  }, [setEdges, readOnly]);

  const rf = useReactFlow<RFNode, Edge>();
  const addBox = useCallback(() => {
    if (readOnly) return;
    const id = uid();
    // Drop the new box near the current viewport centre so it's always visible.
    const { x, y, zoom } = rf.getViewport();
    const cx = (-x + (rf.getViewport().zoom ? window.innerWidth / 4 : 200)) / (zoom || 1);
    const cy = (-y + 160) / (zoom || 1);
    setNodes((nds) => [...nds, {
      id, type: "labeled",
      position: { x: Math.round(cx), y: Math.round(cy) },
      data: { label: "" }, selected: true,
    }]);
  }, [setNodes, readOnly, rf]);

  const deleteSelection = useCallback(() => {
    if (readOnly) return;
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  }, [setNodes, setEdges, readOnly]);

  const stats = useMemo(() => ({ n: nodes.length, e: edges.length }), [nodes.length, edges.length]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChangeGuarded}
      onEdgesChange={onEdgesChangeGuarded}
      onConnect={onConnect}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable
      panOnScroll
      selectionOnDrag={!readOnly}
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      minZoom={0.4}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="rf-flow"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="var(--line-2)" />
      {!readOnly && <Controls position="bottom-right" showInteractive={false} />}
      {!readOnly && (
        <Panel position="top-right" className="rf-panel">
          {hint && <span className="rf-hint">Draw: <b>{hint}</b></span>}
          <div className="rf-actions">
            <button type="button" className="btn plain" onClick={addBox}><Plus width={14} height={14} /> Add box</button>
            <button type="button" className="btn plain"
                    disabled={!nodes.some((n) => n.selected) && !edges.some((e) => e.selected)}
                    onClick={deleteSelection}><Trash width={14} height={14} /> Delete</button>
            <span className="rf-divider" aria-hidden />
            <button type="button" className={`btn plain ${!fullscreen && tipVisible ? "rf-fs-pulse" : ""}`}
                    onClick={onToggleFullscreen}
                    title={fullscreen ? "Exit fullscreen (Esc)" : "Expand the whiteboard to fullscreen (Esc to exit)"}>
              {fullscreen ? <><Minimize width={14} height={14} /> Exit</> : <><FullscreenIcon width={14} height={14} /> Fullscreen</>}
            </button>
          </div>
          <div className="rf-stats">{stats.n} box{stats.n === 1 ? "" : "es"} · {stats.e} arrow{stats.e === 1 ? "" : "s"}</div>
          {!fullscreen && tipVisible && (
            <div className="rf-tip" role="status">
              <span className="rf-tip-arrow" aria-hidden />
              <span><b>Tip:</b> click <i>Fullscreen</i> for more room to sketch.</span>
              <button type="button" className="rf-tip-close" aria-label="Dismiss tip" onClick={onDismissTip}>
                <Close width={12} height={12} />
              </button>
            </div>
          )}
        </Panel>
      )}
      {!readOnly && fullscreen && (
        <Panel position="top-left" className="rf-fs-exit">
          <button type="button" className="btn plain" onClick={onToggleFullscreen}
                  title="Exit fullscreen (Esc)"><Close width={14} height={14} /> Exit fullscreen</button>
          <span className="rf-fs-kbd"><kbd>Esc</kbd> to exit</span>
        </Panel>
      )}
      {stats.n === 0 && (
        <Panel position="top-center" className="rf-empty">
          {readOnly ? "No diagram was submitted." : (
            <>Whiteboard is empty. Use <b>Add box</b>, then drag from a box's dot to connect it to another.</>
          )}
        </Panel>
      )}
    </ReactFlow>
  );
}

/**
 * The whiteboard used for system-design, ER, and flow questions.
 *
 * Public interface is `Diagram` (`{nodes:[{id,label,x,y}], edges:[{id,from,to,label?}]}`) —
 * a small, sanitized shape safe to send to the backend and later serialise into the
 * evaluator LLM's prompt. React Flow's internals never leak past `sanitize()`.
 *
 * `readOnly` disables all editing while keeping pan/zoom, so the report can replay the
 * candidate's diagram from the same data with no extra work.
 *
 * A `key` on the wrapping div gives us a fresh React Flow instance whenever the parent
 * moves to a different question. That avoids syncing the RF state with a controlled
 * value on every render, which is the source of most React-Flow-plus-Next.js headaches.
 */
export default function DiagramCanvas({ value, onChange, readOnly = false, hint, resetKey }: {
  value: Diagram;
  onChange?: (next: Diagram) => void;
  readOnly?: boolean;
  hint?: string | null;
  /** Change this to reset the canvas — e.g. the current question's id. */
  resetKey?: string;
}) {
  const k = resetKey ?? "static";
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);

  // The tip is a subtle nudge, not a takeover. Show it once per browser until the visitor
  // has actually opened fullscreen at least once; then never again.
  useEffect(() => {
    if (readOnly) return;
    try {
      if (localStorage.getItem(TIP_KEY) !== "1") setTipVisible(true);
    } catch { /* private mode: leave the tip on for the session */ setTipVisible(true); }
  }, [readOnly]);

  const rememberSeen = useCallback(() => {
    setTipVisible(false);
    try { localStorage.setItem(TIP_KEY, "1"); } catch { /* ignore */ }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = stage.current;
    if (!el) return;
    rememberSeen();
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
    try {
      if (active) {
        await (document.exitFullscreen?.() ?? (doc as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen?.());
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else {
        // No Fullscreen API (older iOS Safari): fall back to a CSS-fixed overlay.
        setFullscreen((f) => !f);
      }
    } catch {
      // Permission denied or transition failed — fall back to the CSS overlay so the user
      // still gets a bigger canvas rather than nothing.
      setFullscreen((f) => !f);
    }
  }, [rememberSeen]);

  // Keep our `fullscreen` boolean in sync with the browser: Esc, F11, or any other exit
  // fires `fullscreenchange`, so we hear about it even when it isn't us who triggered it.
  useEffect(() => {
    const onChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
      setFullscreen(active === stage.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const dismissTip = useCallback(() => rememberSeen(), [rememberSeen]);

  return (
    <div className={`canvas ${readOnly ? "ro" : ""}`}>
      <div
        ref={stage}
        key={k}
        className={`canvas-stage ${fullscreen ? "fs" : ""}`}
      >
        <ReactFlowProvider>
          <Canvas
            value={value} onChange={onChange} readOnly={readOnly} hint={hint}
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
            tipVisible={tipVisible && !readOnly}
            onDismissTip={dismissTip}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
