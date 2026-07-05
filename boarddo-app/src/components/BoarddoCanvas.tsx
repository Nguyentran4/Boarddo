import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle, useMemo } from "react";
import { exportBoard } from "../utils/export";
import type { ExportOptions } from "../utils/export";
import type { RemoteCursor, StrokeLock } from "../hooks/useSocket";

export type ToolType = "select" | "area-select" | "pen" | "eraser" | "rect" | "circle" | "line" | "arrow" | "triangle" | "diamond" | "star" | "hexagon" | "ellipse" | "text" | "sticky" | "image" | "bucket" | "eyedropper";

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  type: ToolType;
  color: string;
  width: number;
  points: Point[];
  text?: string;
  locked?: boolean;
  imageUrl?: string;
  fillStyle?: "outline" | "solid" | "semi";
  strokeStyle?: "solid" | "dashed" | "dotted";
  noteWidth?: number;
  noteHeight?: number;
  author?: string;
  reactions?: Record<string, number>;
  fontFamily?: string;
}

interface BoarddoCanvasProps {
  color: string;
  brushSize: number;
  tool: ToolType;
  fillStyle?: "outline" | "solid" | "semi";
  strokeStyle?: "solid" | "dashed" | "dotted";
  onStrokeComplete?: (stroke: Stroke) => void;
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  onStrokeUpdate?: (stroke: Stroke, originalStroke?: Stroke) => void;
  onStrokesDelete?: (strokes: Stroke[]) => void;
  remoteCursors: Map<string, RemoteCursor>;
  liveStrokes: Map<string, Stroke>;
  lockedStrokes?: Map<string, StrokeLock>;
  onCursorMove?: (x: number, y: number) => void;
  onDrawStart?: (id: string, type: string, color: string, width: number, point: Point, fillStyle?: "outline" | "solid" | "semi", strokeStyle?: "solid" | "dashed" | "dotted") => void;
  onDrawMove?: (id: string, points: Point[], isShape?: boolean) => void;
  onDrawEnd?: (id: string) => void;
  onToolChange?: (tool: ToolType) => void;
  onColorPick?: (color: string) => void;
  backgroundType?: "none" | "grid" | "dots";
  stickyColor?: string;
  onLockStroke?: (strokeId: string) => void;
  onUnlockStroke?: (strokeId: string) => void;
}

export interface BoarddoCanvasRef {
  exportCanvas: (options: ExportOptions) => void;
}

/** Compute triangle vertices from drag start/end */
function getTrianglePoints(p1: Point, p2: Point): [Point, Point, Point] {
  const midX = (p1.x + p2.x) / 2;
  return [
    { x: midX, y: Math.min(p1.y, p2.y) },
    { x: p1.x, y: Math.max(p1.y, p2.y) },
    { x: p2.x, y: Math.max(p1.y, p2.y) },
  ];
}

/** Snap endpoint to nearest 45° angle from start when Shift is held */
function snapAngle(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: start.x + dist * Math.cos(snapped),
    y: start.y + dist * Math.sin(snapped),
  };
}

/** Constrain endpoint to form a perfect square bounding box from start */
function constrainSquare(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + Math.sign(dx) * size,
    y: start.y + Math.sign(dy) * size,
  };
}

function getStrokeBounds(stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } {
  if (stroke.points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  if (stroke.type === "text" || stroke.type === "sticky") {
    let w = stroke.noteWidth;
    let h = stroke.noteHeight;

    if (w === undefined || h === undefined) {
      const el = document.getElementById(`note-${stroke.id}`);
      if (el) {
        w = w ?? el.offsetWidth;
        h = h ?? el.offsetHeight;
      } else {
        w = w ?? (stroke.type === "sticky" ? 200 : 100);
        h = h ?? (stroke.type === "sticky" ? 200 : 40);
      }
    }
    const p = stroke.points[0];
    return { minX: p.x, minY: p.y, maxX: p.x + w, maxY: p.y + h };
  }

  if (stroke.type === "image" && stroke.points.length >= 2) {
    const [p1, p2] = stroke.points;
    return { minX: Math.min(p1.x, p2.x), minY: Math.min(p1.y, p2.y), maxX: Math.max(p1.x, p2.x), maxY: Math.max(p1.y, p2.y) };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (stroke.type === "circle" && stroke.points.length >= 2) {
    const c = stroke.points[0];
    const e = stroke.points[1];
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    return { minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r };
  }

  if (stroke.type === "triangle" && stroke.points.length >= 2) {
    const [p1, p2] = stroke.points;
    const triPts = getTrianglePoints(p1, p2);
    for (const p of triPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = Math.max(stroke.width, 10);
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  if (stroke.type === "pen" || stroke.type === "eraser" || stroke.type === "rect" || stroke.type === "line" || stroke.type === "arrow" || stroke.type === "diamond" || stroke.type === "star" || stroke.type === "hexagon" || stroke.type === "ellipse") {
    const pad = Math.max(stroke.width, 10);
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
  }

  return { minX, minY, maxX, maxY };
}

function pointInBounds(p: Point, b: { minX: number; minY: number; maxX: number; maxY: number }, padding = 10) {
  return p.x >= b.minX - padding && p.x <= b.maxX + padding &&
    p.y >= b.minY - padding && p.y <= b.maxY + padding;
}

function boundsIntersect(b1: { minX: number; minY: number; maxX: number; maxY: number }, b2: { minX: number; minY: number; maxX: number; maxY: number }) {
  return !(b2.minX > b1.maxX ||
    b2.maxX < b1.minX ||
    b2.minY > b1.maxY ||
    b2.maxY < b1.minY);
}

/** Text/sticky are always selectable; canvas shapes are selectable only while unlocked */
function isSelectableStroke(s: Stroke): boolean {
  if (s.type === "text" || s.type === "sticky") return true;
  if (s.type === "eraser") return false;
  return !s.locked; // Unlocked shapes/images can be moved once
}

// Generate unique IDs for strokes — uses crypto.randomUUID() to prevent
// collisions when multiple users create strokes at the same millisecond
function generateStrokeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'stroke-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
}

// Sticky notes will use the currently selected tool color
const imageCache = new Map<string, HTMLImageElement>();

const BoarddoCanvas = forwardRef<BoarddoCanvasRef, BoarddoCanvasProps>(({
  color,
  brushSize,
  tool,
  fillStyle = "outline",
  strokeStyle = "solid",
  onStrokeComplete,
  strokes,
  onStrokesChange,
  onStrokeUpdate,
  onStrokesDelete,
  remoteCursors,
  liveStrokes,
  lockedStrokes = new Map(),
  onCursorMove,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
  onToolChange,
  onColorPick,
  backgroundType = "none",
  stickyColor,
  onLockStroke,
  onUnlockStroke,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const lastPoint = useRef<Point | null>(null);
  const animFrameId = useRef<number>(0);
  const pendingPoints = useRef<Point[]>([]);
  const shapeStart = useRef<Point | null>(null);
  const [imageTrigger, setImageTrigger] = useState(0);

  // ===== Infinite Canvas Transform State =====
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  // Keep refs in sync for use in non-reactive callbacks
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // Minimap state
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [minimapState, setMinimapState] = useState({ scale: 1, offset: { x: 0, y: 0 }, width: 150, height: 100 });
  const [isDraggingMinimap, setIsDraggingMinimap] = useState(false);

  // Panning state
  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const panOffsetStart = useRef<Point>({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);
  useEffect(() => { spaceHeldRef.current = spaceHeld; }, [spaceHeld]);

  /** Convert screen (client) coords to world coords */
  const screenToWorld = useCallback((screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (screenX - rect.left - offsetRef.current.x) / scaleRef.current,
      y: (screenY - rect.top - offsetRef.current.y) / scaleRef.current,
    };
  }, []);

  // Text/sticky input state
  const [textInput, setTextInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
    value: string;
    isSticky: boolean;
    color?: string;
    width?: number;
    height?: number;
  }>({ visible: false, x: 0, y: 0, value: "", isSticky: false });
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Note interaction state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const editingNoteIdRef = useRef<string | null>(null);
  useEffect(() => { editingNoteIdRef.current = editingNoteId; }, [editingNoteId]);
  const [editValue, setEditValue] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragState, setDragState] = useState<{
    noteId: string;
    startClientX: number; // screen coords at the moment of mousedown
    startClientY: number;
    startWorldX: number;  // note's world position at the moment of mousedown
    startWorldY: number;
    originalStroke: Stroke;
  } | null>(null);

  // Cursor indicator state
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [showCursor, setShowCursor] = useState(false);

  // Drag and drop image upload state
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleImageFile = useCallback((file: File, clientX: number, clientY: number) => {
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const worldX = (clientX - rect.left - offsetRef.current.x) / scaleRef.current;
        const worldY = (clientY - rect.top - offsetRef.current.y) / scaleRef.current;

        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const MAX_W = 500;
        if (w > MAX_W) {
          h = h * (MAX_W / w);
          w = MAX_W;
        }

        const imageStroke: Stroke = {
          id: generateStrokeId(),
          type: "image",
          color: color,
          width: w,
          points: [{ x: worldX, y: worldY }, { x: worldX + w, y: worldY + h }],
          imageUrl: dataUrl,
          locked: false
        };

        const newStrokes = [...strokes, imageStroke];
        onStrokesChange(newStrokes);
        onStrokeComplete?.(imageStroke);
        setSelectedIds(new Set([imageStroke.id]));
        if (tool !== "select") onToolChange?.("select");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [strokes, color, tool, onStrokesChange, onStrokeComplete, onToolChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0], e.clientX, e.clientY);
    }
  }, [handleImageFile]);

  // System Paste listener
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;

      const items = e.clipboardData?.items;
      let pastedImage = false;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              const container = containerRef.current;
              if (container) {
                const rect = container.getBoundingClientRect();
                handleImageFile(file, rect.left + rect.width / 2, rect.top + rect.height / 2);
                pastedImage = true;
                e.preventDefault();
                break;
              }
            }
          }
        }
      }

      // If no image was found in the system clipboard, fall back to our internal shapes clipboard
      if (!pastedImage && clipboardRef.current.length > 0) {
        e.preventDefault();
        const newStrokes = clipboardRef.current.map(s => ({
          ...s,
          id: generateStrokeId(),
          points: s.points.map(p => ({ x: p.x + 20, y: p.y + 20 }))
        }));
        const finalStrokes = [...strokes, ...newStrokes];
        onStrokesChange(finalStrokes);
        newStrokes.forEach(s => onStrokeComplete?.(s));
        setSelectedIds(new Set(newStrokes.map(s => s.id)));
        if (tool !== "select") onToolChange?.("select");
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleImageFile, strokes, onStrokesChange, onStrokeComplete, tool, onToolChange]);


  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pendingSelectStrokeId = useRef<string | null>(null);
  const dragSelectionStart = useRef<Point | null>(null);
  const dragOriginalStrokes = useRef<Stroke[]>([]);
  const dragTempStrokes = useRef<Stroke[] | null>(null);
  const isDraggingSelection = useRef(false);
  const isResizingSelection = useRef(false);
  const resizeHandle = useRef<string | null>(null);
  const dragSelectionBounds = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const isCreatingSelectionBox = useRef(false);
  const [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);

  // Clipboard for Copy/Paste
  const clipboardRef = useRef<Stroke[]>([]);

  // Area Select state
  const [areaSelectRect, setAreaSelectRect] = useState<{ start: Point; end: Point } | null>(null);
  const areaSelectRectRef = useRef<typeof areaSelectRect>(null);
  useEffect(() => { areaSelectRectRef.current = areaSelectRect; }, [areaSelectRect]);
  const [floatingSelection, setFloatingSelection] = useState<{
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const isAreaSelecting = useRef(false); // true while actively dragging to draw the rect
  const areaSelectStart = useRef<Point | null>(null);
  const floatingDragStart = useRef<Point | null>(null);
  const floatingOrigPos = useRef<Point | null>(null);
  const floatingSelectionRef = useRef<typeof floatingSelection>(null);
  useEffect(() => { floatingSelectionRef.current = floatingSelection; }, [floatingSelection]);

  // Keyboard delete + spacebar tracking for panning
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        setSpaceHeld(true);
      }
      if ((e.key === "Delete" || e.key === "Backspace")) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") {
          return;
        }
        // Delete/discard floating area selection
        if (floatingSelectionRef.current) {
          e.preventDefault();
          setFloatingSelection(null);
          return;
        }
        // Delete/discard confirmed area-select rect
        if (areaSelectRectRef.current) {
          e.preventDefault();
          setAreaSelectRect(null);
          return;
        }
        if (selectedIds.size > 0) {
          e.preventDefault();
          // Lock the deselected strokes before removing them
          const lockUpdated = strokes.map(s =>
            selectedIds.has(s.id) ? s : s
          );
          const deletedStrokes = lockUpdated.filter(s => selectedIds.has(s.id));
          const newStrokes = lockUpdated.filter(s => !selectedIds.has(s.id));
          onStrokesChange(newStrokes);
          if (deletedStrokes.length > 0) {
            onStrokesDelete?.(deletedStrokes);
          }
          setSelectedIds(new Set());
        }
      }

      // Escape — discard floating area selection or confirmed rect
      if (e.key === "Escape") {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        if (floatingSelectionRef.current) {
          e.preventDefault();
          setFloatingSelection(null);
          setAreaSelectRect(null);
          return;
        }
        if (areaSelectRectRef.current) {
          e.preventDefault();
          setAreaSelectRect(null);
          return;
        }
      }

      // Ctrl+C (Copy) — handle floating selection, confirmed area rect, or normal selected strokes
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !(e.ctrlKey && e.shiftKey)) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        // Copy the floating selection
        if (floatingSelectionRef.current) {
          e.preventDefault();
          const fs = floatingSelectionRef.current;
          clipboardRef.current = [{
            id: generateStrokeId(),
            type: "image",
            color: "#000",
            width: fs.width,
            points: [{ x: fs.x, y: fs.y }, { x: fs.x + fs.width, y: fs.y + fs.height }],
            imageUrl: fs.imageUrl,
            locked: false,
          }];
          return;
        }
        // Copy from confirmed area-select rect (rasterize on demand)
        if (areaSelectRectRef.current) {
          e.preventDefault();
          const r = areaSelectRectRef.current;
          const rx = Math.min(r.start.x, r.end.x);
          const ry = Math.min(r.start.y, r.end.y);
          const rw = Math.abs(r.end.x - r.start.x);
          const rh = Math.abs(r.end.y - r.start.y);
          if (rw > 5 && rh > 5) {
            const canvas = canvasRef.current;
            if (canvas) {
              const imageUrl = captureCanvasRegion(canvas, { x: rx, y: ry, w: rw, h: rh });
              clipboardRef.current = [{
                id: generateStrokeId(),
                type: "image",
                color: "#000",
                width: rw,
                points: [{ x: rx, y: ry }, { x: rx + rw, y: ry + rh }],
                imageUrl,
                locked: false,
              }];
            }
          }
          return;
        }
        if (selectedIds.size > 0) {
          e.preventDefault();
          clipboardRef.current = strokes.filter(s => selectedIds.has(s.id));
        }
      }

      // Ctrl+D (Duplicate)
      const isDuplicate = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d";

      if (isDuplicate) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        const srcStrokes = strokes.filter(s => selectedIds.has(s.id));
        if (srcStrokes.length > 0) {
          const newStrokes = srcStrokes.map(s => ({
            ...s,
            id: generateStrokeId(),
            points: s.points.map(p => ({ x: p.x + 20, y: p.y + 20 }))
          }));
          const finalStrokes = [...strokes, ...newStrokes];
          onStrokesChange(finalStrokes);
          newStrokes.forEach(s => onStrokeComplete?.(s));
          // Auto select the new ones
          setSelectedIds(new Set(newStrokes.map(s => s.id)));
          if (tool !== "select") onToolChange?.("select");
        }
      }

      // Bring to front / Send to back using Shift + ] or [
      if ((e.key === "]" || e.key === "[") && e.shiftKey && selectedIds.size > 0) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        const unselected = strokes.filter(s => !selectedIds.has(s.id));
        const selected = strokes.filter(s => selectedIds.has(s.id));
        const newStrokes = e.key === "]" ? [...unselected, ...selected] : [...selected, ...unselected];
        onStrokesChange(newStrokes);
      }
      // Hotkey: A for area-select
      if (e.key.toLowerCase() === "a" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        onToolChange?.("area-select");
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        setSpaceHeld(false);
        isPanning.current = false;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [strokes, selectedIds, onStrokesChange, onStrokeComplete, onStrokesDelete, onToolChange, tool]);

  useEffect(() => {
    if (tool !== "select" && tool !== "area-select") {
      // Commit any floating selection before switching tools
      if (floatingSelectionRef.current) {
        commitFloatingSelectionRef.current();
      }
      // Unlock + lock all currently selected canvas shapes when switching away from select
      if (selectedIds.size > 0) {
        for (const prevId of selectedIds) {
          onUnlockStroke?.(prevId);
        }
        const newStrokes = strokes.map(s => {
          if (selectedIds.has(s.id) && s.type !== "text" && s.type !== "sticky") {
            return { ...s, locked: true };
          }
          return s;
        });
        onStrokesChange(newStrokes);
      }
      setSelectedIds(new Set());
      setSelectionBox(null);
      setAreaSelectRect(null);
      setFloatingSelection(null);
    }
  }, [tool, onStrokesChange, onUnlockStroke, selectedIds, strokes]);

  useEffect(() => {
    if (tool !== "select" || !pendingSelectStrokeId.current) return;

    const id = pendingSelectStrokeId.current;
    pendingSelectStrokeId.current = null;

    if (strokes.some(s => s.id === id && isSelectableStroke(s))) {
      setSelectedIds(new Set([id]));
      onLockStroke?.(id);
    }
  }, [tool, strokes, onLockStroke]);

  // Export handle
  useImperativeHandle(ref, () => ({
    exportCanvas: (options: ExportOptions) => {
      exportBoard(options.selectionOnly ? strokes.filter(s => selectedIds.has(s.id)) : strokes, options, getStrokeBounds);
    }
  }), [strokes, selectedIds]);

  // ===== Canvas Sizing =====
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    redrawAllRef.current(canvas, strokes);
  }, [strokes]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // ===== Drawing Helpers =====
  function redrawAll(canvas: HTMLCanvasElement, allStrokes: Stroke[], extraStrokes?: Stroke[]) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset
    ctx.clearRect(0, 0, w, h);

    // Apply pan + zoom transform
    ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, dpr * offsetRef.current.x, dpr * offsetRef.current.y);

    for (const stroke of allStrokes) {
      drawStroke(ctx, stroke);
    }

    if (extraStrokes) {
      for (const stroke of extraStrokes) {
        drawStroke(ctx, stroke);
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset after drawing
  }

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.width;

    if (stroke.type === "eraser" || stroke.color === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.fillStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
    }

    if (stroke.strokeStyle === "dashed") {
      ctx.setLineDash([stroke.width * 2, stroke.width * 2]);
    } else if (stroke.strokeStyle === "dotted") {
      ctx.setLineDash([stroke.width, stroke.width * 2]);
    } else {
      ctx.setLineDash([]);
    }

    switch (stroke.type) {
      case "pen":
      case "eraser":
        drawPenStroke(ctx, stroke);
        break;
      case "rect":
        drawRectStroke(ctx, stroke);
        break;
      case "circle":
        drawCircleStroke(ctx, stroke);
        break;
      case "line":
        drawLineStroke(ctx, stroke);
        break;
      case "arrow":
        drawArrowStroke(ctx, stroke);
        break;
      case "triangle":
        drawTriangleStroke(ctx, stroke);
        break;
      case "diamond":
        drawDiamondStroke(ctx, stroke);
        break;
      case "star":
        drawStarStroke(ctx, stroke);
        break;
      case "hexagon":
        drawHexagonStroke(ctx, stroke);
        break;
      case "ellipse":
        drawEllipseStroke(ctx, stroke);
        break;
      case "image":
        drawImageStroke(ctx, stroke);
        break;
      case "sticky":
      case "text":
        drawNotePlaceholder(ctx, stroke);
        break;
    }

    ctx.restore();
  }

  function drawNotePlaceholder(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    const b = getStrokeBounds(stroke);
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;

    if (stroke.type === "sticky") {
      ctx.fillStyle = stroke.color;
      ctx.fillRect(b.minX, b.minY, w, h);
      // Add a subtle border
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      ctx.strokeRect(b.minX, b.minY, w, h);
    } else {
      // For text notes, draw a subtle semi-transparent box
      ctx.fillStyle = stroke.color + "22"; // 22 is ~13% opacity
      ctx.fillRect(b.minX, b.minY, w, h);
      ctx.strokeStyle = stroke.color + "44"; // 44 is ~26% opacity
      ctx.lineWidth = 1;
      ctx.strokeRect(b.minX, b.minY, w, h);
    }
  }

  function drawImageStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 1 || !stroke.imageUrl) return;
    const [p1, p2] = stroke.points;
    const pEnd = p2 || p1;

    let img = imageCache.get(stroke.id);
    if (!img) {
      img = new Image();
      img.onload = () => {
        setImageTrigger(prev => prev + 1);
      };
      img.src = stroke.imageUrl;
      imageCache.set(stroke.id, img);
    }

    if (img.complete && img.naturalWidth > 0) {
      const x = Math.min(p1.x, pEnd.x);
      const y = Math.min(p1.y, pEnd.y);
      const w = Math.max(1, Math.abs(pEnd.x - p1.x));
      const h = Math.max(1, Math.abs(pEnd.y - p1.y));
      ctx.drawImage(img, x, y, w, h);
    }
  }

  function drawPenStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length - 1; i++) {
      const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, midX, midY);
    }

    const last = stroke.points[stroke.points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function drawRectStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [p1, p2] = stroke.points;
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    if (stroke.color !== "eraser" && stroke.fillStyle && stroke.fillStyle !== "outline") {
      ctx.fillStyle = stroke.fillStyle === "solid" ? stroke.color : stroke.color + '33';
      ctx.fill();
    }
    ctx.stroke();
  }

  function drawCircleStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [center, edge] = stroke.points;
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    if (stroke.color !== "eraser" && stroke.fillStyle && stroke.fillStyle !== "outline") {
      ctx.fillStyle = stroke.fillStyle === "solid" ? stroke.color : stroke.color + '33';
      ctx.fill();
    }
    ctx.stroke();
  }

  function drawLineStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [p1, p2] = stroke.points;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  function drawArrowStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [p1, p2] = stroke.points;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const headLen = Math.max(12, stroke.width * 3);

    // Line
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(
      p2.x - headLen * Math.cos(angle - Math.PI / 6),
      p2.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      p2.x - headLen * Math.cos(angle + Math.PI / 6),
      p2.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  function drawTriangleStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [p1, p2] = stroke.points;
    const pts = getTrianglePoints(p1, p2);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath();
    if (stroke.color !== "eraser" && stroke.fillStyle && stroke.fillStyle !== "outline") {
      ctx.fillStyle = stroke.fillStyle === "solid" ? stroke.color : stroke.color + '33';
      ctx.fill();
    }
    ctx.stroke();
  }

  function drawDiamondStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [p1, p2] = stroke.points;
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const hw = Math.abs(p2.x - p1.x) / 2;
    const hh = Math.abs(p2.y - p1.y) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh); // top
    ctx.lineTo(cx + hw, cy); // right
    ctx.lineTo(cx, cy + hh); // bottom
    ctx.lineTo(cx - hw, cy); // left
    ctx.closePath();
    if (stroke.color !== "eraser" && stroke.fillStyle && stroke.fillStyle !== "outline") {
      ctx.fillStyle = stroke.fillStyle === "solid" ? stroke.color : stroke.color + '33';
      ctx.fill();
    }
    ctx.stroke();
  }

  function drawStarStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [p1, p2] = stroke.points;
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const outerR = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)) / 2;
    const innerR = outerR * 0.4;
    const spikes = 5;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI * i) / spikes - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (stroke.color !== "eraser" && stroke.fillStyle && stroke.fillStyle !== "outline") {
      ctx.fillStyle = stroke.fillStyle === "solid" ? stroke.color : stroke.color + '33';
      ctx.fill();
    }
    ctx.stroke();
  }

  function drawHexagonStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [p1, p2] = stroke.points;
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const r = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)) / 2;
    const sides = 6;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (stroke.color !== "eraser" && stroke.fillStyle && stroke.fillStyle !== "outline") {
      ctx.fillStyle = stroke.fillStyle === "solid" ? stroke.color : stroke.color + '33';
      ctx.fill();
    }
    ctx.stroke();
  }

  function drawEllipseStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [p1, p2] = stroke.points;
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const rx = Math.abs(p2.x - p1.x) / 2;
    const ry = Math.abs(p2.y - p1.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    if (stroke.color !== "eraser" && stroke.fillStyle && stroke.fillStyle !== "outline") {
      ctx.fillStyle = stroke.fillStyle === "solid" ? stroke.color : stroke.color + '33';
      ctx.fill();
    }
    ctx.stroke();
  }

  // Draw a live segment as user moves (for real-time pen feedback)
  function drawLiveSegment(
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    strokeColor: string,
    strokeWidth: number
  ) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = strokeWidth;

    if (strokeColor === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = strokeColor;
    }

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  const redrawAllRef = useRef(redrawAll);
  const drawStrokeRef = useRef(drawStroke);
  redrawAllRef.current = redrawAll;
  drawStrokeRef.current = drawStroke;

  // ===== Re-render when strokes, live strokes, or transform changes =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const liveStrokeArray = Array.from(liveStrokes.values());
      redrawAllRef.current(canvas, strokes, liveStrokeArray);
    }

    const mCanvas = minimapCanvasRef.current;
    if (mCanvas && containerRef.current) {
      const ctx = mCanvas.getContext("2d");
      if (ctx) {
        let minX = 0, minY = 0, maxX = 0, maxY = 0;
        if (strokes.length > 0) {
          minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
          for (const s of strokes) {
            const b = getStrokeBounds(s);
            if (b.minX === 0 && b.maxX === 0 && b.minY === 0 && b.maxY === 0) continue;
            if (b.minX < minX) minX = b.minX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.maxY > maxY) maxY = b.maxY;
          }
        }
        if (minX === Infinity) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

        const rect = containerRef.current.getBoundingClientRect();
        const vpMinX = -offsetRef.current.x / scaleRef.current;
        const vpMinY = -offsetRef.current.y / scaleRef.current;
        const vpMaxX = vpMinX + rect.width / scaleRef.current;
        const vpMaxY = vpMinY + rect.height / scaleRef.current;

        minX = strokes.length > 0 ? Math.min(minX, vpMinX) : vpMinX;
        minY = strokes.length > 0 ? Math.min(minY, vpMinY) : vpMinY;
        maxX = strokes.length > 0 ? Math.max(maxX, vpMaxX) : vpMaxX;
        maxY = strokes.length > 0 ? Math.max(maxY, vpMaxY) : vpMaxY;

        const margin = 100;
        minX -= margin; minY -= margin; maxX += margin; maxY += margin;

        const contentW = Math.max(1, maxX - minX);
        const contentH = Math.max(1, maxY - minY);

        const miniScale = Math.min(mCanvas.width / contentW, mCanvas.height / contentH);
        const miniOffsetX = (mCanvas.width - contentW * miniScale) / 2 - minX * miniScale;
        const miniOffsetY = (mCanvas.height - contentH * miniScale) / 2 - minY * miniScale;

        // Using setMinimapState in useEffect can cause re-renders, but it's safe if we don't depend on it in this effect
        setMinimapState({ scale: miniScale, offset: { x: miniOffsetX, y: miniOffsetY }, width: mCanvas.width, height: mCanvas.height });

        ctx.clearRect(0, 0, mCanvas.width, mCanvas.height);
        ctx.save();
        ctx.translate(miniOffsetX, miniOffsetY);
        ctx.scale(miniScale, miniScale);

        for (const s of strokes) {
          drawStrokeRef.current(ctx, s);
        }
        ctx.restore();

        ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
        ctx.lineWidth = 1;
        ctx.strokeRect(
          vpMinX * miniScale + miniOffsetX,
          vpMinY * miniScale + miniOffsetY,
          (rect.width / scaleRef.current) * miniScale,
          (rect.height / scaleRef.current) * miniScale
        );

        ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
        ctx.fillRect(
          vpMinX * miniScale + miniOffsetX,
          vpMinY * miniScale + miniOffsetY,
          (rect.width / scaleRef.current) * miniScale,
          (rect.height / scaleRef.current) * miniScale
        );
      }
    }
  }, [strokes, liveStrokes, scale, offset, imageTrigger]);

  // ===== Zoom with mouse wheel =====
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1 - e.deltaY * 0.001;
      const newScale = Math.min(10, Math.max(0.1, scaleRef.current * zoomFactor));
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Adjust offset so zoom is centered on cursor
      const newOffsetX = mx - (mx - offsetRef.current.x) * (newScale / scaleRef.current);
      const newOffsetY = my - (my - offsetRef.current.y) * (newScale / scaleRef.current);
      scaleRef.current = newScale;
      offsetRef.current = { x: newOffsetX, y: newOffsetY };
      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // ===== Focus text input when visible =====
  useEffect(() => {
    if (textInput.visible && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput.visible]);

  // ===== Focus editing textarea =====
  useEffect(() => {
    if (editingNoteId && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingNoteId]);

  // ===== Note drag handlers (document-level) =====
  // Using a ref for the strokes so the effect never needs to re-register due to
  // strokes changing — that was causing listener gaps on every single mousemove.
  const strokesRef = useRef(strokes);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMoveDoc = (e: MouseEvent) => {
      // Delta approach: compute screen-space movement from the initial click,
      // convert to world-space by dividing by the current scale.
      // This is immune to getBoundingClientRect() discrepancies and pan/offset state.
      const dx = e.clientX - dragState.startClientX;
      const dy = e.clientY - dragState.startClientY;
      const newWorldX = dragState.startWorldX + dx / scaleRef.current;
      const newWorldY = dragState.startWorldY + dy / scaleRef.current;

      const updatedStrokes = strokesRef.current.map((s) =>
        s.id === dragState.noteId
          ? { ...s, points: [{ x: newWorldX, y: newWorldY }] }
          : s
      );
      onStrokesChange(updatedStrokes);

      // Real-time synchronization for other users
      const currentNote = updatedStrokes.find((s) => s.id === dragState.noteId);
      if (currentNote) {
        onStrokeUpdate?.(currentNote);
      }
    };

    const handleMouseUpDoc = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startClientX;
      const dy = e.clientY - dragState.startClientY;
      const newWorldX = dragState.startWorldX + dx / scaleRef.current;
      const newWorldY = dragState.startWorldY + dy / scaleRef.current;

      const updatedStroke = strokesRef.current.find((s) => s.id === dragState.noteId);
      if (updatedStroke) {
        const finalStroke = {
          ...updatedStroke,
          points: [{ x: newWorldX, y: newWorldY }],
        };
        onStrokeUpdate?.(finalStroke, dragState.originalStroke);
      }

      setDragState(null);
    };

    document.addEventListener("mousemove", handleMouseMoveDoc);
    document.addEventListener("mouseup", handleMouseUpDoc);
    return () => {
      document.removeEventListener("mousemove", handleMouseMoveDoc);
      document.removeEventListener("mouseup", handleMouseUpDoc);
    };
    // Only (re-)register when drag starts/ends — strokes is accessed via ref
  }, [dragState, onStrokesChange, onStrokeUpdate]);

  // ===== Pointer Events =====
  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    return screenToWorld(e.clientX, e.clientY);
  }

  const getCanvasPointRef = useRef(getCanvasPoint);
  getCanvasPointRef.current = getCanvasPoint;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      // Spacebar panning OR middle-click (button 1) panning
      if (spaceHeldRef.current || e.button === 1) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        panOffsetStart.current = { ...offsetRef.current };
        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // Eyedropper tool
      if (tool === "eyedropper") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const x = (e.clientX - rect.left) * dpr;
        const y = (e.clientY - rect.top) * dpr;

        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const hex = "#" +
          ("0" + pixel[0].toString(16)).slice(-2) +
          ("0" + pixel[1].toString(16)).slice(-2) +
          ("0" + pixel[2].toString(16)).slice(-2);

        onColorPick?.(hex + "ff"); // Add alpha channel
        return;
      }

      const point = getCanvasPointRef.current(e);

      // Paint bucket tool
      if (tool === "bucket") {
        let bucketHitId = null;
        for (let i = strokes.length - 1; i >= 0; i--) {
          const s = strokes[i];
          if (s.type === "text" || s.type === "sticky" || s.type === "image" || s.type === "line" || s.type === "arrow" || s.type === "eraser") continue;
          if (pointInBounds(point, getStrokeBounds(s), 5)) {
            bucketHitId = s.id;
            break;
          }
        }

        if (bucketHitId) {
          const targetStroke = strokes.find(s => s.id === bucketHitId);
          if (targetStroke) {
            const updated = { ...targetStroke, fillStyle: "solid" as const, color: color };
            const newStrokes = strokes.map(s => s.id === bucketHitId ? updated : s);
            onStrokesChange(newStrokes);
            onStrokeUpdate?.(updated, targetStroke);

            const canvas = canvasRef.current;
            if (canvas) {
              const liveStrokeArray = Array.from(liveStrokes.values());
              cancelAnimationFrame(animFrameId.current);
              animFrameId.current = requestAnimationFrame(() => {
                redrawAllRef.current(canvas, newStrokes, liveStrokeArray);
              });
            }
          }
        }
        return;
      }

      // Area Select tool
      if (tool === "area-select") {
        // If a floating selection exists, handle it first
        if (floatingSelection) {
          const isInside =
            point.x >= floatingSelection.x &&
            point.x <= floatingSelection.x + floatingSelection.width &&
            point.y >= floatingSelection.y &&
            point.y <= floatingSelection.y + floatingSelection.height;

          if (isInside) {
            // Start dragging the floating selection
            floatingDragStart.current = point;
            floatingOrigPos.current = { x: floatingSelection.x, y: floatingSelection.y };
            canvasRef.current?.setPointerCapture(e.pointerId);
          } else {
            // Click outside — commit the floating selection as an image stroke
            commitFloatingSelectionRef.current();
          }
          return;
        }

        // If a confirmed area-select rect exists (user already drew it), handle clicks on it
        if (areaSelectRect && !isAreaSelecting.current) {
          const rx = Math.min(areaSelectRect.start.x, areaSelectRect.end.x);
          const ry = Math.min(areaSelectRect.start.y, areaSelectRect.end.y);
          const rw = Math.abs(areaSelectRect.end.x - areaSelectRect.start.x);
          const rh = Math.abs(areaSelectRect.end.y - areaSelectRect.start.y);

          const isInsideRect =
            point.x >= rx && point.x <= rx + rw &&
            point.y >= ry && point.y <= ry + rh;

          if (isInsideRect && rw > 5 && rh > 5) {
            // Rasterize the area and create floating selection for dragging
            const canvas = canvasRef.current;
            if (canvas) {
              const imageUrl = captureCanvasRegion(canvas, { x: rx, y: ry, w: rw, h: rh });
              setFloatingSelection({ imageUrl, x: rx, y: ry, width: rw, height: rh });
              setAreaSelectRect(null);
              // Start dragging immediately
              floatingDragStart.current = point;
              floatingOrigPos.current = { x: rx, y: ry };
              canvasRef.current?.setPointerCapture(e.pointerId);
            }
          } else {
            // Click outside confirmed rect — dismiss it
            setAreaSelectRect(null);
          }
          return;
        }

        // Start drawing a new area selection rectangle
        isAreaSelecting.current = true;
        areaSelectStart.current = point;
        setAreaSelectRect({ start: point, end: point });
        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // 1. If we are currently typing a new note, ignore new clicks (let blur handle it)
      if (textInput.visible) return;

      // 2. If we are currently editing an existing note, blur the textarea to submit and exit edit mode
      if (editingNoteIdRef.current) {
        editTextareaRef.current?.blur();
        setSelectedIds(new Set()); // Deselect
        return; // Consume the click so it doesn't create new notes or boxes
      }


      let hitId = null;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        if (!isSelectableStroke(s)) continue;
        // Skip strokes locked by other users
        if (lockedStrokes.has(s.id)) continue;
        const b = getStrokeBounds(s);
        if (pointInBounds(point, b, 5)) {
          hitId = s.id;
          break;
        }
      }

      const isClickingSelected = hitId && selectedIds.has(hitId);

      if (tool === "select" || isClickingSelected) {
        if (hitId) {
          let newSelected = new Set(selectedIds);
          if (!e.shiftKey) {
            if (!newSelected.has(hitId)) {
              // Unlock + lock previously selected canvas shapes before selecting new one
              if (selectedIds.size > 0) {
                // Unlock all previously selected strokes
                for (const prevId of selectedIds) {
                  onUnlockStroke?.(prevId);
                }
                const locked = strokes.map(s => {
                  if (selectedIds.has(s.id) && s.type !== "text" && s.type !== "sticky") {
                    return { ...s, locked: true };
                  }
                  return s;
                });
                onStrokesChange(locked);
              }
              newSelected = new Set([hitId]);
            }
          } else {
            if (newSelected.has(hitId)) {
              newSelected.delete(hitId);
              onUnlockStroke?.(hitId);
            } else {
              newSelected.add(hitId);
            }
          }
          setSelectedIds(newSelected);
          // Lock newly selected strokes for other users
          for (const id of newSelected) {
            onLockStroke?.(id);
          }

          isDraggingSelection.current = true;
          dragSelectionStart.current = point;
          dragOriginalStrokes.current = strokes.filter(s => newSelected.has(s.id));
        } else {
          if (!e.shiftKey) {
            // Unlock + lock any previously selected canvas shapes before clearing selection
            if (selectedIds.size > 0) {
              for (const prevId of selectedIds) {
                onUnlockStroke?.(prevId);
              }
              const newStrokes = strokes.map(s => {
                if (selectedIds.has(s.id) && s.type !== "text" && s.type !== "sticky") {
                  return { ...s, locked: true };
                }
                return s;
              });
              onStrokesChange(newStrokes);
            }
            setSelectedIds(new Set());
          }
          isCreatingSelectionBox.current = false;
          // Pan the canvas by left-click dragging empty space
          isPanning.current = true;
          panStart.current = { x: e.clientX, y: e.clientY };
          panOffsetStart.current = { ...offsetRef.current };
        }

        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      // If we are currently editing or creating a note, don't allow drawing/new notes
      if (textInput.visible || editingNoteId) return;

      // If we are starting to draw/type something new, lock and deselect previous shapes
      if (selectedIds.size > 0) {
        for (const prevId of selectedIds) {
          onUnlockStroke?.(prevId);
        }
        const newStrokes = strokes.map(s => {
          if (selectedIds.has(s.id) && s.type !== "text" && s.type !== "sticky") {
            return { ...s, locked: true };
          }
          return s;
        });
        onStrokesChange(newStrokes);
        setSelectedIds(new Set());
      }

      // Text tool: place input at click position (world coords)
      if (tool === "text") {
        const worldPt = screenToWorld(e.clientX, e.clientY);
        setTextInput({
          visible: true,
          x: worldPt.x,
          y: worldPt.y,
          value: "",
          isSticky: false,
          color: color,
        });
        return;
      }

      // Sticky tool: instantly place a 200×200 sticky note and start editing it
      if (tool === "sticky") {
        const worldPt = screenToWorld(e.clientX, e.clientY);
        const defaultW = 200;
        const defaultH = 200;
        const noteStroke: Stroke = {
          id: generateStrokeId(),
          type: "sticky",
          color: stickyColor || "#fef08aff",
          width: brushSize,
          points: [{ x: worldPt.x - defaultW / 2, y: worldPt.y - defaultH / 2 }],
          text: "",
          noteWidth: defaultW,
          noteHeight: defaultH,
        };
        const newStrokes = [...strokes, noteStroke];
        onStrokesChange(newStrokes);
        onStrokeComplete?.(noteStroke);
        setSelectedIds(new Set([noteStroke.id]));
        // Enter edit mode immediately
        setEditingNoteId(noteStroke.id);
        setEditValue("");
        if (onToolChange) onToolChange("select");
        return;
      }

      isDrawing.current = true;
      lastPoint.current = point;
      pendingPoints.current = [];
      shapeStart.current = (tool === "rect" || tool === "circle" || tool === "line" || tool === "arrow" || tool === "triangle" || tool === "diamond" || tool === "star" || tool === "hexagon" || tool === "ellipse") ? point : null;

      const strokeColor = tool === "eraser" ? "eraser" : color;

      currentStroke.current = {
        id: generateStrokeId(),
        type: tool,
        color: strokeColor,
        width: brushSize,
        points: [point],
        fillStyle,
        strokeStyle,
      };

      // Emit draw-start to other users (include type so shapes render correctly)
      onDrawStart?.(currentStroke.current.id, tool, strokeColor, brushSize, point, fillStyle, strokeStyle);

      canvasRef.current?.setPointerCapture(e.pointerId);
    },
    [areaSelectRect, brushSize, color, editingNoteId, fillStyle, floatingSelection, liveStrokes, lockedStrokes, onColorPick, onDrawStart, onLockStroke, onStrokeComplete, onStrokeUpdate, onStrokesChange, onToolChange, onUnlockStroke, screenToWorld, selectedIds, stickyColor, strokes, strokeStyle, textInput.visible, tool]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // Handle panning
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        const newOffset = { x: panOffsetStart.current.x + dx, y: panOffsetStart.current.y + dy };
        offsetRef.current = newOffset;
        setOffset(newOffset);
        return;
      }

      const point = getCanvasPointRef.current(e);

      setCursorPos({ x: e.clientX, y: e.clientY });

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        onCursorMove?.(point.x / rect.width, point.y / rect.height);
      }


      // Area-select: rubber-band rectangle OR drag floating selection
      if (tool === "area-select") {
        if (isAreaSelecting.current && areaSelectStart.current) {
          setAreaSelectRect({ start: areaSelectStart.current, end: point });
          return;
        }
        if (floatingDragStart.current && floatingOrigPos.current) {
          const dx = point.x - floatingDragStart.current.x;
          const dy = point.y - floatingDragStart.current.y;
          const newX = floatingOrigPos.current.x + dx;
          const newY = floatingOrigPos.current.y + dy;
          // Direct DOM update for smooth dragging (avoid React re-render per frame)
          const el = document.getElementById('floating-selection');
          if (el) {
            el.style.left = newX + 'px';
            el.style.top = newY + 'px';
          }
          return;
        }
      }

      if (tool === "select" || isDraggingSelection.current || isResizingSelection.current) {
        if (isDraggingSelection.current && dragSelectionStart.current) {
          const dx = point.x - dragSelectionStart.current.x;
          const dy = point.y - dragSelectionStart.current.y;

          let myDx = dx;
          let myDy = dy;
          const SNAP_DIST = 10;

          const draggedBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
          dragOriginalStrokes.current.forEach(s => {
            const b = getStrokeBounds(s);
            draggedBounds.minX = Math.min(draggedBounds.minX, b.minX + dx);
            draggedBounds.minY = Math.min(draggedBounds.minY, b.minY + dy);
            draggedBounds.maxX = Math.max(draggedBounds.maxX, b.maxX + dx);
            draggedBounds.maxY = Math.max(draggedBounds.maxY, b.maxY + dy);
          });
          const centerX = (draggedBounds.minX + draggedBounds.maxX) / 2;
          const centerY = (draggedBounds.minY + draggedBounds.maxY) / 2;

          let bestDx = 0;
          let bestDy = 0;
          let snapFoundX = false;
          let snapFoundY = false;

          strokes.forEach(s => {
            if (selectedIds.has(s.id)) return;
            const b = getStrokeBounds(s);
            const bCenterX = (b.minX + b.maxX) / 2;
            const bCenterY = (b.minY + b.maxY) / 2;

            [
              draggedBounds.minX - b.minX,
              draggedBounds.minX - b.maxX,
              draggedBounds.maxX - b.minX,
              draggedBounds.maxX - b.maxX,
              centerX - bCenterX
            ].forEach(diff => {
              if (Math.abs(diff) < SNAP_DIST && (!snapFoundX || Math.abs(diff) < Math.abs(bestDx))) {
                bestDx = diff;
                snapFoundX = true;
              }
            });

            [
              draggedBounds.minY - b.minY,
              draggedBounds.minY - b.maxY,
              draggedBounds.maxY - b.minY,
              draggedBounds.maxY - b.maxY,
              centerY - bCenterY
            ].forEach(diff => {
              if (Math.abs(diff) < SNAP_DIST && (!snapFoundY || Math.abs(diff) < Math.abs(bestDy))) {
                bestDy = diff;
                snapFoundY = true;
              }
            });
          });

          if (snapFoundX) myDx -= bestDx;
          if (snapFoundY) myDy -= bestDy;

          const movedStrokes = dragOriginalStrokes.current.map(orig => {
            const newPoints = orig.points.map(p => ({ x: p.x + myDx, y: p.y + myDy }));
            return { ...orig, points: newPoints };
          });

          const newStrokes = strokes.map(s => {
            const moved = movedStrokes.find(m => m.id === s.id);
            return moved ? moved : s;
          });

          const canvas = canvasRef.current;
          if (canvas) {
            const liveStrokeArray = Array.from(liveStrokes.values());
            cancelAnimationFrame(animFrameId.current);
            animFrameId.current = requestAnimationFrame(() => {
              redrawAllRef.current(canvas, newStrokes, liveStrokeArray);
              movedStrokes.forEach(s => {
                const el = document.getElementById(`note-${s.id}`);
                if (el && s.points[0]) {
                  el.style.left = s.points[0].x + 'px';
                  el.style.top = s.points[0].y + 'px';
                }
                const boundEl = document.getElementById(`bounds-${s.id}`);
                if (boundEl) {
                  const b = getStrokeBounds(s);
                  boundEl.style.left = (b.minX - 5) + 'px';
                  boundEl.style.top = (b.minY - 5) + 'px';
                  boundEl.style.width = (b.maxX - b.minX + 10) + 'px';
                  boundEl.style.height = (b.maxY - b.minY + 10) + 'px';
                }
              });
            });
          }
          dragTempStrokes.current = newStrokes;

          // Real-time synchronization for other users
          movedStrokes.forEach(s => {
            onStrokeUpdate?.(s);
          });

        } else if (isResizingSelection.current && dragSelectionStart.current && dragSelectionBounds.current) {
          const dx = point.x - dragSelectionStart.current.x;
          const dy = point.y - dragSelectionStart.current.y;
          const b = dragSelectionBounds.current;
          const w = b.maxX - b.minX;
          const h = b.maxY - b.minY;
          if (w === 0 || h === 0) return;

          let scaleX = 1;
          let scaleY = 1;
          let originX = b.minX;
          let originY = b.minY;

          if (resizeHandle.current === 'se') {
            scaleX = (w + dx) / w; scaleY = (h + dy) / h;
            originX = b.minX; originY = b.minY;
          } else if (resizeHandle.current === 'nw') {
            scaleX = (w - dx) / w; scaleY = (h - dy) / h;
            originX = b.maxX; originY = b.maxY;
          } else if (resizeHandle.current === 'ne') {
            scaleX = (w + dx) / w; scaleY = (h - dy) / h;
            originX = b.minX; originY = b.maxY;
          } else if (resizeHandle.current === 'sw') {
            scaleX = (w - dx) / w; scaleY = (h + dy) / h;
            originX = b.maxX; originY = b.minY;
          }

          if (e.shiftKey) {
            const uniformScale = Math.max(Math.abs(scaleX), Math.abs(scaleY));
            scaleX = Math.sign(scaleX || 1) * uniformScale;
            scaleY = Math.sign(scaleY || 1) * uniformScale;
          }

          if (scaleX === 0) scaleX = 0.01;
          if (scaleY === 0) scaleY = 0.01;
          const movedStrokes = dragOriginalStrokes.current.map(orig => {
            const newPoints = orig.points.map(p => ({
              x: originX + (p.x - originX) * scaleX,
              y: originY + (p.y - originY) * scaleY
            }));

            let newNoteWidth = orig.noteWidth;
            let newNoteHeight = orig.noteHeight;
            if (orig.type === "text" || orig.type === "sticky") {
              const baseW = orig.noteWidth ?? (orig.type === "sticky" ? 200 : 100);
              const baseH = orig.noteHeight ?? (orig.type === "sticky" ? 200 : 40);
              newNoteWidth = Math.max(20, Math.abs(baseW * scaleX));
              newNoteHeight = Math.max(20, Math.abs(baseH * scaleY));

              if (scaleX < 0) {
                newPoints[0].x -= newNoteWidth;
              }
              if (scaleY < 0) {
                newPoints[0].y -= newNoteHeight;
              }
            }

            // Only scale stroke width for freehand paths. Shapes should retain their border thickness.
            const isPath = orig.type === "pen" || orig.type === "eraser";
            const newWidth = isPath ? orig.width * Math.max(Math.abs(scaleX), Math.abs(scaleY)) : orig.width;

            return { ...orig, points: newPoints, width: newWidth, noteWidth: newNoteWidth, noteHeight: newNoteHeight };
          });;

          const newStrokes = strokes.map(s => {
            const moved = movedStrokes.find(m => m.id === s.id);
            return moved ? moved : s;
          });

          const canvas = canvasRef.current;
          if (canvas) {
            const liveStrokeArray = Array.from(liveStrokes.values());
            cancelAnimationFrame(animFrameId.current);
            animFrameId.current = requestAnimationFrame(() => {
              redrawAllRef.current(canvas, newStrokes, liveStrokeArray);
              movedStrokes.forEach(s => {
                const el = document.getElementById(`note-${s.id}`);
                if (el && s.points[0]) {
                  el.style.left = s.points[0].x + 'px';
                  el.style.top = s.points[0].y + 'px';
                  if (s.noteWidth !== undefined) el.style.width = s.noteWidth + 'px';
                  if (s.noteHeight !== undefined) el.style.height = s.noteHeight + 'px';
                  if (el.classList.contains('text-note')) {
                    el.style.fontSize = Math.max(14, s.width * 4) + 'px';
                  }
                }
                const boundEl = document.getElementById(`bounds-${s.id}`);
                if (boundEl) {
                  const b = getStrokeBounds(s);
                  boundEl.style.left = (b.minX - 5) + 'px';
                  boundEl.style.top = (b.minY - 5) + 'px';
                  boundEl.style.width = (b.maxX - b.minX + 10) + 'px';
                  boundEl.style.height = (b.maxY - b.minY + 10) + 'px';
                }
              });
            });
          }
          dragTempStrokes.current = newStrokes;

        } else if (isCreatingSelectionBox.current) {
          setSelectionBox(prev => prev ? { ...prev, end: point } : null);
        }
        return;
      }
      if (!isDrawing.current || !currentStroke.current || !lastPoint.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const isShape = tool === "rect" || tool === "circle" || tool === "line" || tool === "arrow" || tool === "triangle" || tool === "diamond" || tool === "star" || tool === "hexagon" || tool === "ellipse";

      if (isShape && shapeStart.current) {
        // Shift-snap for line/arrow: lock to 0°/45°/90° angles
        // Shift-snap for others: perfect square
        let drawPoint = point;
        if (e.shiftKey) {
          if (tool === "line" || tool === "arrow") {
            drawPoint = snapAngle(shapeStart.current, point);
          } else {
            drawPoint = constrainSquare(shapeStart.current, point);
          }
        }
        currentStroke.current.points = [shapeStart.current, drawPoint];

        const liveStrokeArray = Array.from(liveStrokes.values());
        redrawAllRef.current(canvas, strokes, liveStrokeArray);
        // Draw in-progress shape in world-transform space
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, dpr * offsetRef.current.x, dpr * offsetRef.current.y);
        drawStrokeRef.current(ctx, currentStroke.current);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        onDrawMove?.(currentStroke.current.id, [point], true);
      } else {
        // Draw live segment in world-transform space
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, dpr * offsetRef.current.x, dpr * offsetRef.current.y);
        drawLiveSegment(ctx, lastPoint.current, point, currentStroke.current.color, currentStroke.current.width);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        currentStroke.current.points.push(point);
        lastPoint.current = point;

        pendingPoints.current.push(point);
        onDrawMove?.(currentStroke.current.id, pendingPoints.current);
        pendingPoints.current = [];
      }
    },
    [liveStrokes, onCursorMove, onDrawMove, onStrokeUpdate, selectedIds, strokes, tool]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {

      // Stop panning
      if (isPanning.current) {
        isPanning.current = false;
        canvasRef.current?.releasePointerCapture(e.pointerId);
        return;
      }

      // Area-select: finalize the selection rectangle or stop dragging floating selection
      if (tool === "area-select") {
        canvasRef.current?.releasePointerCapture(e.pointerId);

        // Done drawing the rect — immediately capture and create image stroke
        if (isAreaSelecting.current && areaSelectRect) {
          isAreaSelecting.current = false;
          areaSelectStart.current = null;

          const rx = Math.min(areaSelectRect.start.x, areaSelectRect.end.x);
          const ry = Math.min(areaSelectRect.start.y, areaSelectRect.end.y);
          const rw = Math.abs(areaSelectRect.end.x - areaSelectRect.start.x);
          const rh = Math.abs(areaSelectRect.end.y - areaSelectRect.start.y);

          // If too small, discard
          if (rw <= 5 || rh <= 5) {
            setAreaSelectRect(null);
            return;
          }

          // Capture the area as an image stroke and switch to select tool
          const canvas = canvasRef.current;
          if (canvas) {
            const imageUrl = captureCanvasRegion(canvas, { x: rx, y: ry, w: rw, h: rh });
            const imageStroke: Stroke = {
              id: generateStrokeId(),
              type: "image",
              color: "#000",
              width: rw,
              points: [{ x: rx, y: ry }, { x: rx + rw, y: ry + rh }],
              imageUrl,
              locked: false,
            };
            const newStrokes = [...strokes, imageStroke];
            onStrokesChange(newStrokes);
            onStrokeComplete?.(imageStroke);
            setSelectedIds(new Set([imageStroke.id]));
            setAreaSelectRect(null);
            onToolChange?.("select");
          }
          return;
        }

        // Stop dragging floating selection — commit final position to state
        if (floatingDragStart.current && floatingOrigPos.current) {
          const pt = getCanvasPointRef.current(e);
          const dx = pt.x - floatingDragStart.current.x;
          const dy = pt.y - floatingDragStart.current.y;
          const fs = floatingSelectionRef.current;
          if (fs) {
            setFloatingSelection({
              ...fs,
              x: floatingOrigPos.current.x + dx,
              y: floatingOrigPos.current.y + dy,
            });
          }
          floatingDragStart.current = null;
          floatingOrigPos.current = null;
          return;
        }
        return;
      }

      if (tool === "select" || isDraggingSelection.current || isResizingSelection.current) {
        canvasRef.current?.releasePointerCapture(e.pointerId);
        if (isResizingSelection.current || isDraggingSelection.current) {
          isResizingSelection.current = false;
          isDraggingSelection.current = false;
          resizeHandle.current = null;
          dragSelectionStart.current = null;
          dragSelectionBounds.current = null;

          if (dragTempStrokes.current) {
            // Keep shapes unlocked after the move/resize so they can still be edited
            const finalStrokes = dragTempStrokes.current;
            onStrokesChange(finalStrokes);
            const selectedStrokes = finalStrokes.filter(s => selectedIds.has(s.id));
            for (const s of selectedStrokes) {
              const original = dragOriginalStrokes.current.find(orig => orig.id === s.id);
              onStrokeUpdate?.(s, original);
            }
            dragTempStrokes.current = null;
          }
        } else if (isCreatingSelectionBox.current && selectionBox) {
          isCreatingSelectionBox.current = false;
          const boxBounds = {
            minX: Math.min(selectionBox.start.x, selectionBox.end.x),
            maxX: Math.max(selectionBox.start.x, selectionBox.end.x),
            minY: Math.min(selectionBox.start.y, selectionBox.end.y),
            maxY: Math.max(selectionBox.start.y, selectionBox.end.y)
          };

          const newlySelected = new Set(selectedIds);
          for (const s of strokes) {
            if (!isSelectableStroke(s)) continue; // Only text/sticky are selectable
            if (boundsIntersect(getStrokeBounds(s), boxBounds)) {
              newlySelected.add(s.id);
            }
          }
          setSelectedIds(newlySelected);
          setSelectionBox(null);
        }
        return;
      }
      if (!isDrawing.current || !currentStroke.current) return;

      isDrawing.current = false;
      canvasRef.current?.releasePointerCapture(e.pointerId);

      onDrawEnd?.(currentStroke.current.id);

      const isShape = tool === "rect" || tool === "circle" || tool === "line" || tool === "arrow" || tool === "triangle" || tool === "diamond" || tool === "star" || tool === "hexagon" || tool === "ellipse";

      if (currentStroke.current.points.length >= 2) {
        if (isShape) {
          let finalPoint = getCanvasPointRef.current(e);
          if (e.shiftKey && shapeStart.current) {
            if (tool === "line" || tool === "arrow") {
              finalPoint = snapAngle(shapeStart.current, finalPoint);
            } else {
              finalPoint = constrainSquare(shapeStart.current, finalPoint);
            }
          }
          currentStroke.current.points = [shapeStart.current!, finalPoint];
        }

        const completedStroke = { ...currentStroke.current, locked: !isShape };
        const newStrokes = [...strokes, completedStroke];
        onStrokesChange(newStrokes);
        onStrokeComplete?.(completedStroke);

        // Auto-select the new shape so user can move/resize it immediately
        if (isShape) {
          pendingSelectStrokeId.current = completedStroke.id;
          setSelectedIds(new Set([completedStroke.id]));
          onToolChange?.("select");
        }

        const canvas = canvasRef.current;
        if (canvas) {
          cancelAnimationFrame(animFrameId.current);
          animFrameId.current = requestAnimationFrame(() => {
            const liveStrokeArray = Array.from(liveStrokes.values());
            redrawAllRef.current(canvas, newStrokes, liveStrokeArray);
          });
        }
      }

      // Sticky notes are now created on click, not by drag drawing, so this path is unused.
      // But if tool was sticky, just discard the current stroke as it was handled already.
      if (currentStroke.current.type === "sticky") {
        currentStroke.current = null;
        lastPoint.current = null;
        shapeStart.current = null;
        pendingPoints.current = [];
        return;
      }

      currentStroke.current = null;
      lastPoint.current = null;
      shapeStart.current = null;
      pendingPoints.current = [];
    },
    [areaSelectRect, liveStrokes, onDrawEnd, onStrokeComplete, onStrokeUpdate, onStrokesChange, onToolChange, selectedIds, selectionBox, strokes, tool]
  );

  const handlePointerEnter = useCallback(() => setShowCursor(true), []);
  const handlePointerLeave = useCallback(() => {
    setShowCursor(false);
    if (isDrawing.current && currentStroke.current) {
      isDrawing.current = false;
      onDrawEnd?.(currentStroke.current.id);
      if (currentStroke.current.points.length >= 2) {
        const completedStroke = { ...currentStroke.current };
        const newStrokes = [...strokes, completedStroke];
        onStrokesChange(newStrokes);
        onStrokeComplete?.(completedStroke);
      }
      currentStroke.current = null;
      lastPoint.current = null;
      shapeStart.current = null;
    }
  }, [strokes, onStrokesChange, onStrokeComplete, onDrawEnd]);

  // ===== Text/Sticky Input Submit =====
  const handleTextSubmit = useCallback(() => {
    // If text is blank, we still create the note as requested (with blank text)
    // but we always switch back to select mode for a smoother experience.
    const noteStroke: Stroke = {
      id: generateStrokeId(),
      type: textInput.isSticky ? "sticky" : "text",
      color: textInput.color || color,
      width: brushSize,
      points: [{ x: textInput.x, y: textInput.y }],
      text: textInput.value || "", // Allow empty string
      noteWidth: textInput.width,
      noteHeight: textInput.height,
    };

    const newStrokes = [...strokes, noteStroke];
    onStrokesChange(newStrokes);
    onStrokeComplete?.(noteStroke);

    setTextInput({ visible: false, x: 0, y: 0, value: "", isSticky: false, width: undefined, height: undefined, color: undefined });

    // Switch to select tool automatically
    if (onToolChange) onToolChange("select");
  }, [textInput, color, brushSize, strokes, onStrokesChange, onStrokeComplete, onToolChange]);

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleTextSubmit();
      }
      if (e.key === "Escape") {
        setTextInput({ visible: false, x: 0, y: 0, value: "", isSticky: false, width: undefined, height: undefined, color: undefined });
      }
      e.stopPropagation();
    },
    [handleTextSubmit]
  );

  // ===== Sticky Note Resize Handles =====
  const stickyResizeRef = useRef<{
    noteId: string;
    handle: string;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handleStickyResizeDown = useCallback(
    (e: React.PointerEvent, noteId: string, handle: string) => {
      e.stopPropagation();
      e.preventDefault();
      const note = strokes.find(s => s.id === noteId);
      if (!note) return;
      const pos = note.points[0];
      stickyResizeRef.current = {
        noteId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        origW: note.noteWidth ?? 200,
        origH: note.noteHeight ?? 200,
        origX: pos.x,
        origY: pos.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [strokes]
  );

  const handleStickyResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!stickyResizeRef.current) return;
      e.stopPropagation();
      const { noteId, handle, startX, startY, origW, origH, origX, origY } = stickyResizeRef.current;
      const dxScreen = e.clientX - startX;
      const dyScreen = e.clientY - startY;
      const dx = dxScreen / scaleRef.current;
      const dy = dyScreen / scaleRef.current;

      let newW = origW, newH = origH, newX = origX, newY = origY;
      if (handle === 'se') { newW = Math.max(80, origW + dx); newH = Math.max(80, origH + dy); }
      if (handle === 'sw') { newW = Math.max(80, origW - dx); newH = Math.max(80, origH + dy); newX = origX + origW - newW; }
      if (handle === 'ne') { newW = Math.max(80, origW + dx); newH = Math.max(80, origH - dy); newY = origY + origH - newH; }
      if (handle === 'nw') { newW = Math.max(80, origW - dx); newH = Math.max(80, origH - dy); newX = origX + origW - newW; newY = origY + origH - newH; }

      // Direct DOM update for performance during resize
      const el = document.getElementById(`note-${noteId}`);
      if (el) {
        el.style.width = newW + 'px';
        el.style.height = newH + 'px';
        el.style.left = newX + 'px';
        el.style.top = newY + 'px';
      }
      const boundEl = document.getElementById(`bounds-${noteId}`);
      if (boundEl) {
        boundEl.style.left = (newX - 5) + 'px';
        boundEl.style.top = (newY - 5) + 'px';
        boundEl.style.width = (newW + 10) + 'px';
        boundEl.style.height = (newH + 10) + 'px';
      }
    },
    []
  );

  const handleStickyResizeUp = useCallback(
    (e: React.PointerEvent) => {
      if (!stickyResizeRef.current) return;
      e.stopPropagation();
      const { noteId, handle, startX, startY, origW, origH, origX, origY } = stickyResizeRef.current;
      const dx = (e.clientX - startX) / scaleRef.current;
      const dy = (e.clientY - startY) / scaleRef.current;

      let newW = origW, newH = origH, newX = origX, newY = origY;
      if (handle === 'se') { newW = Math.max(80, origW + dx); newH = Math.max(80, origH + dy); }
      if (handle === 'sw') { newW = Math.max(80, origW - dx); newH = Math.max(80, origH + dy); newX = origX + origW - newW; }
      if (handle === 'ne') { newW = Math.max(80, origW + dx); newH = Math.max(80, origH - dy); newY = origY + origH - newH; }
      if (handle === 'nw') { newW = Math.max(80, origW - dx); newH = Math.max(80, origH - dy); newX = origX + origW - newW; newY = origY + origH - newH; }

      const original = strokes.find(s => s.id === noteId);
      const updated = original ? { ...original, noteWidth: newW, noteHeight: newH, points: [{ x: newX, y: newY }] } : null;
      if (updated && original) {
        onStrokesChange(strokes.map(s => s.id === noteId ? updated : s));
        onStrokeUpdate?.(updated, original);
      }
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      stickyResizeRef.current = null;
    },
    [strokes, onStrokesChange, onStrokeUpdate]
  );

  // ===== Note Interaction Handlers =====
  const handleNoteMouseDown = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      // If we're clicking an eraser on it, delete it
      if (tool === "eraser") {
        const remaining = strokes.filter(s => s.id !== noteId);
        onStrokesChange(remaining);
        const deleted = strokes.find(s => s.id === noteId);
        if (deleted) onStrokesDelete?.([deleted]);
        return;
      }

      // Skip if locked by another user
      if (lockedStrokes.has(noteId)) return;

      // Unlock previously selected strokes
      for (const prevId of selectedIds) {
        if (prevId !== noteId) onUnlockStroke?.(prevId);
      }
      setSelectedIds(new Set([noteId])); // Select the note so handles appear
      onLockStroke?.(noteId); // Lock for other users

      if (editingNoteId === noteId) return; // Don't drag while editing
      e.preventDefault();
      e.stopPropagation();
      // Store the raw screen position at click time and the note's current world position.
      // The move handler computes screen-space delta from this start point and divides
      // by scale — no BoundingClientRect needed, no coordinate system mismatch possible.
      const note = strokes.find(s => s.id === noteId);
      if (!note) return;
      const notePos = note.points[0] ?? { x: 0, y: 0 };
      setDragState({
        noteId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWorldX: notePos.x,
        startWorldY: notePos.y,
        originalStroke: note,
      });
    },
    [editingNoteId, tool, strokes, onStrokesChange, onStrokesDelete, setSelectedIds, lockedStrokes, onLockStroke, onUnlockStroke, selectedIds]
  );

  const handleNoteDoubleClick = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const note = strokes.find((s) => s.id === noteId);
      if (note) {
        setEditingNoteId(noteId);
        setEditValue(note.text || "");
      }
    },
    [strokes]
  );


  const handleEditSubmit = useCallback(
    (noteId: string) => {
      if (!editValue.trim()) {
        // Delete empty notes
        const newStrokes = strokes.filter((s) => s.id !== noteId);
        onStrokesChange(newStrokes);
        const deleted = strokes.find((s) => s.id === noteId);
        if (deleted) {
          onStrokeUpdate?.({ ...deleted, text: "" }, deleted);
          onStrokesDelete?.([deleted]);
        }
      } else {
        const updated = strokes.find((s) => s.id === noteId);
        if (updated && updated.text !== editValue) {
          const updatedStroke = { ...updated, text: editValue };
          onStrokesChange(strokes.map((s) => (s.id === noteId ? updatedStroke : s)));
          onStrokeUpdate?.(updatedStroke, updated);
        }
      }
      setEditingNoteId(null);
      setEditValue("");
    },
    [editValue, onStrokesChange, onStrokeUpdate, onStrokesDelete, strokes]
  );

  // Handle Tab key in sticky note editing to create next note (Miro-style)
  const handleStickyEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, noteId: string) => {
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        // Submit current edit
        handleEditSubmit(noteId);
        // Create a new note to the right
        const note = strokes.find(s => s.id === noteId);
        if (note) {
          const nw = note.noteWidth ?? 200;
          const pos = note.points[0];
          const newNote: Stroke = {
            id: generateStrokeId(),
            type: "sticky",
            color: note.color,
            width: note.width,
            points: [{ x: pos.x + nw + 16, y: pos.y }],
            text: "",
            noteWidth: nw,
            noteHeight: note.noteHeight ?? 200,
          };
          const newStrokes = [...strokes, newNote];
          onStrokesChange(newStrokes);
          onStrokeComplete?.(newNote);
          setSelectedIds(new Set([newNote.id]));
          // Enter edit mode on new note
          setTimeout(() => {
            setEditingNoteId(newNote.id);
            setEditValue("");
          }, 50);
        }
      }
      if (e.key === "Escape") {
        setEditingNoteId(null);
      }
      e.stopPropagation();
    },
    [strokes, onStrokesChange, onStrokeComplete, handleEditSubmit]
  );

  // Filter notes (text + sticky) from strokes for DOM rendering
  const noteStrokes = strokes.filter((s) => s.type === "text" || s.type === "sticky");

  // Convert remote cursors map to array for rendering
  const remoteCursorList = Array.from(remoteCursors.values());

  // Determine cursor style based on tool

  const startResize = (e: React.PointerEvent, pos: string, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    isResizingSelection.current = true;
    resizeHandle.current = pos;
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      dragSelectionStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    if (!selectedIds.has(id)) {
      setSelectedIds(new Set([id]));
      dragOriginalStrokes.current = [strokes.find(s => s.id === id)!];
    } else {
      dragOriginalStrokes.current = strokes.filter(s => selectedIds.has(s.id));
    }

    // Compute combined bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    dragOriginalStrokes.current.forEach(s => {
      const b = getStrokeBounds(s);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    });
    dragSelectionBounds.current = { minX, minY, maxX, maxY };

    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  /** Rasterize a world-coordinate region of the canvas into a PNG data URL */
  function captureCanvasRegion(
    canvas: HTMLCanvasElement,
    worldRect: { x: number; y: number; w: number; h: number }
  ): string {
    const dpr = window.devicePixelRatio || 1;
    const sx = (worldRect.x * scaleRef.current + offsetRef.current.x) * dpr;
    const sy = (worldRect.y * scaleRef.current + offsetRef.current.y) * dpr;
    const sw = Math.max(1, worldRect.w * scaleRef.current * dpr);
    const sh = Math.max(1, worldRect.h * scaleRef.current * dpr);

    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(
      Math.round(sx), Math.round(sy),
      Math.round(sw), Math.round(sh)
    );

    const offscreen = document.createElement("canvas");
    offscreen.width = Math.round(sw);
    offscreen.height = Math.round(sh);
    offscreen.getContext("2d")!.putImageData(imageData, 0, 0);
    return offscreen.toDataURL("image/png");
  }

  /** Commit the floating area selection as a permanent image stroke */
  function commitFloatingSelection() {
    const fs = floatingSelectionRef.current;
    if (!fs) return;
    const imageStroke: Stroke = {
      id: generateStrokeId(),
      type: "image",
      color: "#000",
      width: fs.width,
      points: [
        { x: fs.x, y: fs.y },
        { x: fs.x + fs.width, y: fs.y + fs.height }
      ],
      imageUrl: fs.imageUrl,
      locked: false,
    };
    const newStrokes = [...strokes, imageStroke];
    onStrokesChange(newStrokes);
    onStrokeComplete?.(imageStroke);
    setSelectedIds(new Set([imageStroke.id]));
    setFloatingSelection(null);
    if (tool !== "select") onToolChange?.("select");
  }

  const commitFloatingSelectionRef = useRef(commitFloatingSelection);
  commitFloatingSelectionRef.current = commitFloatingSelection;

  const getCursorStyle = () => {
    if (spaceHeld) return isPanning.current ? 'grabbing' : 'grab';
    switch (tool) {
      case "text":
      case "sticky": return "crosshair";
      case "rect":
      case "circle":
      case "line":
      case "arrow":
      case "triangle":
      case "diamond":
      case "star":
      case "hexagon":
      case "ellipse":
      case "bucket": return "crosshair";
      case "eyedropper": return "crosshair";
      case "area-select": return "crosshair";
      case "select": return "default";
      default: return "none";
    }
  };

  const handleStyle = (pos: string): React.CSSProperties => {
    const style: React.CSSProperties = {
      position: 'absolute',
      width: 10, height: 10,
      backgroundColor: '#fff',
      border: '1px solid #3b82f6',
      borderRadius: '50%',
      pointerEvents: 'auto',
    };
    if (pos === 'nw') { style.top = -4; style.left = -4; style.cursor = 'nwse-resize'; }
    if (pos === 'ne') { style.top = -4; style.right = -4; style.cursor = 'nesw-resize'; }
    if (pos === 'sw') { style.bottom = -4; style.left = -4; style.cursor = 'nesw-resize'; }
    if (pos === 'se') { style.bottom = -4; style.right = -4; style.cursor = 'nwse-resize'; }
    return style;
  };

  const scrollBounds = useMemo(() => {
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    if (strokes.length > 0) {
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      for (const s of strokes) {
        const b = getStrokeBounds(s);
        if (b.minX === 0 && b.maxX === 0 && b.minY === 0 && b.maxY === 0) continue;
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
      }
    }
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

    // Add extra padding so scrollbars aren't immediately blocked
    const p = 1500;
    return { minX: minX - p, maxX: maxX + p, minY: minY - p, maxY: maxY + p };
  }, [strokes]);

  const resetView = useCallback(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const updateOffsetFromMinimap = useCallback((e: React.PointerEvent) => {
    const mCanvas = minimapCanvasRef.current;
    const container = containerRef.current;
    if (!mCanvas || !container) return;
    const rect = mCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldX = (x - minimapState.offset.x) / minimapState.scale;
    const worldY = (y - minimapState.offset.y) / minimapState.scale;

    const containerRect = container.getBoundingClientRect();
    const newOffsetX = -worldX * scaleRef.current + containerRect.width / 2;
    const newOffsetY = -worldY * scaleRef.current + containerRect.height / 2;

    offsetRef.current = { x: newOffsetX, y: newOffsetY };
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [minimapState]);

  const handleMinimapPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateOffsetFromMinimap(e);
    setIsDraggingMinimap(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [updateOffsetFromMinimap]);

  const handleMinimapPointerMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (isDraggingMinimap) {
      updateOffsetFromMinimap(e);
    }
  }, [isDraggingMinimap, updateOffsetFromMinimap]);

  const handleMinimapPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDraggingMinimap(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);


  return (
    <div
      className="canvas-container"
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        backgroundImage: backgroundType === 'grid'
          ? 'linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px)'
          : backgroundType === 'dots'
            ? 'radial-gradient(circle, rgba(0, 0, 0, 0.1) 1px, transparent 1px)'
            : 'none',
        backgroundSize: `${20 * scale}px ${20 * scale}px`,
        backgroundPosition: `${offset.x}px ${offset.y}px`
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={{ touchAction: "none", cursor: getCursorStyle() }}
      />

      {/* Custom cursor indicator (local user, pen/eraser only) — screen space */}
      {showCursor && cursorPos && (tool === "pen" || tool === "eraser") && (
        <div
          className="cursor-indicator"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            width: brushSize + 4,
            height: brushSize + 4,
            borderColor:
              tool === "eraser"
                ? "rgba(255,107,157,0.5)"
                : "rgba(108,99,255,0.5)",
          }}
        />
      )}

      {/* Transform wrapper for all DOM overlays */}
      <div
        className="canvas-transform-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          pointerEvents: 'none',
          width: 0,
          height: 0,
        }}
      >

        {/* ===== Note overlays (text + sticky) ===== */}
        {noteStrokes.map((note) => {
          const pos = note.points[0] || { x: 0, y: 0 };
          const isEditing = editingNoteId === note.id;
          const isDragging = dragState?.noteId === note.id;

          if (note.type === "sticky") {
            const noteW = note.noteWidth ?? 200;
            const noteH = note.noteHeight ?? 200;
            const isSelected = selectedIds.has(note.id);
            // Auto-scale font: base 18px for 200x200, scale proportionally
            const fontScale = Math.min(noteW, noteH) / 200;
            const fontSize = Math.max(12, Math.min(24, 18 * fontScale));
            return (
              <div
                key={note.id}
                id={`note-${note.id}`}
                className={`note-overlay sticky-note ${isDragging ? "note-overlay--dragging" : ""} ${isSelected ? "note-overlay--selected" : ""}`}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: noteW,
                  height: noteH,
                  backgroundColor: note.color,
                  fontFamily: note.fontFamily,
                  fontSize: `${fontSize}px`,
                }}
                onMouseDown={(e) => handleNoteMouseDown(e, note.id)}
                onDoubleClick={(e) => handleNoteDoubleClick(e, note.id)}
              >
                {isEditing ? (
                  <textarea
                    ref={editTextareaRef}
                    className="sticky-note__textarea"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleStickyEditKeyDown(e, note.id)}
                    onBlur={() => handleEditSubmit(note.id)}
                    autoFocus
                  />
                ) : (
                  <div className="sticky-note__text">{note.text || ""}</div>
                )}
                {/* Sticky-specific resize handles */}
                {isSelected && !isEditing && (
                  <>
                    {(['nw', 'ne', 'sw', 'se'] as const).map(h => (
                      <div
                        key={h}
                        className={`sticky-resize-handle sticky-resize-handle--${h}`}
                        onPointerDown={(e) => handleStickyResizeDown(e, note.id, h)}
                        onPointerMove={handleStickyResizeMove}
                        onPointerUp={handleStickyResizeUp}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          }

          // Text note
          return (
            <div
              key={note.id}
              id={`note-${note.id}`}
              className={`note-overlay text-note ${isDragging ? "note-overlay--dragging" : ""} ${selectedIds.has(note.id) ? "note-overlay--selected" : ""}`}
              style={{
                left: pos.x,
                top: pos.y,
                width: note.noteWidth,
                height: note.noteHeight,
                color: note.color,
                fontFamily: note.fontFamily,
                fontSize: `${Math.max(14, note.width * 4)}px`,
              }}
              onMouseDown={(e) => handleNoteMouseDown(e, note.id)}
              onDoubleClick={(e) => handleNoteDoubleClick(e, note.id)}
            >
              {isEditing ? (
                <textarea
                  ref={editTextareaRef}
                  className="text-note__textarea"
                  style={{
                    color: note.color,
                    fontSize: "inherit",
                    fontFamily: note.fontFamily,
                  }}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleEditSubmit(note.id);
                    }
                    if (e.key === "Escape") {
                      setEditingNoteId(null);
                    }
                    e.stopPropagation();
                  }}
                  onBlur={() => handleEditSubmit(note.id)}
                  autoFocus
                />
              ) : (
                <div className="text-note__content">{note.text}</div>
              )}
            </div>
          );
        })}

        {/* Text/Sticky creation input */}
        {textInput.visible && (
          <div
            className={textInput.isSticky ? "note-creation sticky-note" : "note-creation text-creation"}
            style={{
              left: textInput.x,
              top: textInput.y,
              width: textInput.width,
              height: textInput.height,
              ...(textInput.isSticky
                ? { backgroundColor: textInput.color }
                : { color: textInput.color }),
            }}
          >
            <textarea
              ref={textInputRef}
              className={textInput.isSticky ? "sticky-note__textarea" : "text-creation__input"}
              style={textInput.isSticky ? {} : { color: textInput.color, fontSize: `${Math.max(14, brushSize * 4)}px` }}
              value={textInput.value}
              onChange={(e) =>
                setTextInput((prev) => ({ ...prev, value: e.target.value }))
              }
              onKeyDown={handleTextKeyDown}
              onBlur={handleTextSubmit}
              placeholder={textInput.isSticky ? "Type your note..." : "Type here..."}
              autoFocus
            />
          </div>
        )}


        {/* Selection Box Overlay */}
        {selectionBox && (
          <div
            className="selection-box"
            style={{
              position: 'absolute',
              border: '1px solid #4ade80',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              left: Math.min(selectionBox.start.x, selectionBox.end.x),
              top: Math.min(selectionBox.start.y, selectionBox.end.y),
              width: Math.abs(selectionBox.end.x - selectionBox.start.x),
              height: Math.abs(selectionBox.end.y - selectionBox.start.y),
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Area Select Rectangle (marching ants) */}
        {areaSelectRect && (
          <div
            className="area-select-rect"
            style={{
              position: 'absolute',
              left: Math.min(areaSelectRect.start.x, areaSelectRect.end.x),
              top: Math.min(areaSelectRect.start.y, areaSelectRect.end.y),
              width: Math.abs(areaSelectRect.end.x - areaSelectRect.start.x),
              height: Math.abs(areaSelectRect.end.y - areaSelectRect.start.y),
              border: '1px dashed rgba(59, 130, 246, 0.6)',
              backgroundColor: 'rgba(59, 130, 246, 0.05)',
              pointerEvents: 'none',
            }}
          >
            {/* Corner handles */}
            {(['nw', 'ne', 'sw', 'se'] as const).map(pos => {
              const style: React.CSSProperties = {
                position: 'absolute',
                width: 8,
                height: 8,
                backgroundColor: '#fff',
                border: '1px solid rgba(59, 130, 246, 0.8)',
                borderRadius: '50%',
                pointerEvents: 'none',
              };
              if (pos === 'nw') { style.top = -4; style.left = -4; }
              if (pos === 'ne') { style.top = -4; style.right = -4; }
              if (pos === 'sw') { style.bottom = -4; style.left = -4; }
              if (pos === 'se') { style.bottom = -4; style.right = -4; }
              return <div key={pos} style={style} />;
            })}
          </div>
        )}

        {/* Floating Area Selection */}
        {floatingSelection && (
          <div
            id="floating-selection"
            className="floating-selection"
            style={{
              position: 'absolute',
              left: floatingSelection.x,
              top: floatingSelection.y,
              width: floatingSelection.width,
              height: floatingSelection.height,
              pointerEvents: 'none',
            }}
          >
            <img
              src={floatingSelection.imageUrl}
              alt="Area selection"
              draggable={false}
              style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
            />
          </div>
        )}

        {/* Selected Items Bounds Overlays */}
        {Array.from(selectedIds).map(id => {
          const s = strokes.find(st => st.id === id);
          if (!s || !isSelectableStroke(s)) return null;
          // Hide generic bounds for sticky note, since it implements its own selection bounds!
          if (s.type === 'sticky') return null;
          const b = getStrokeBounds(s);
          return (
            <div
              key={`bounds-${id}`}
              id={`bounds-${id}`} className="selected-bounds"
              style={{
                position: 'absolute',
                border: '1px dashed #3b82f6',
                left: b.minX - 5,
                top: b.minY - 5,
                width: b.maxX - b.minX + 10,
                height: b.maxY - b.minY + 10,
                pointerEvents: 'none',
              }}
            >

              <div className="resize-handle nw" style={handleStyle('nw')} onPointerDown={(e) => startResize(e, 'nw', id)} />
              <div className="resize-handle ne" style={handleStyle('ne')} onPointerDown={(e) => startResize(e, 'ne', id)} />
              <div className="resize-handle sw" style={handleStyle('sw')} onPointerDown={(e) => startResize(e, 'sw', id)} />
              <div className="resize-handle se" style={handleStyle('se')} onPointerDown={(e) => startResize(e, 'se', id)} />

            </div>
          );
        })}

        {/* Remote User Lock Indicators */}
        {Array.from(lockedStrokes.entries()).map(([strokeId, lock]) => {
          const s = strokes.find(st => st.id === strokeId);
          if (!s) return null;
          const b = getStrokeBounds(s);
          return (
            <div
              key={`lock-${strokeId}`}
              className="lock-indicator"
              style={{
                position: 'absolute',
                border: `2px solid ${lock.userColor}44`,
                backgroundColor: `${lock.userColor}08`,
                borderRadius: 4,
                left: b.minX - 8,
                top: b.minY - 8,
                width: b.maxX - b.minX + 16,
                height: b.maxY - b.minY + 16,
                pointerEvents: 'none',
              }}
            >
              <div
                className="lock-indicator__badge"
                style={{
                  position: 'absolute',
                  top: -10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: lock.userColor,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  lineHeight: '16px',
                }}
              >
                🔒 {lock.userName}
              </div>
            </div>
          );
        })}
      </div>{/* end transform layer */}

      {/* Remote user cursors */}
      {remoteCursorList.map((cursor) => (
        <div
          key={cursor.id}
          className="remote-cursor"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
          }}
        >
          <svg
            className="remote-cursor__arrow"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={cursor.color}
          >
            <path d="M0 0L14 10.28L6.92 11.19L3.33 19.57L0 0Z" />
          </svg>
          <div
            className="remote-cursor__label"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.name}
          </div>
        </div>
      ))}

      {/* Zoom indicator + UI Controls */}
      <div className="zoom-controls">
        <button className="zoom-controls__btn" onClick={() => {
          const newScale = Math.max(0.1, scale - 0.1);
          scaleRef.current = newScale;
          setScale(newScale);
        }} title="Zoom Out">-</button>
        <span className="zoom-controls__level" onClick={resetView} title="Reset to 100%" style={{ cursor: 'pointer' }}>{Math.round(scale * 100)}%</span>
        <button className="zoom-controls__btn" onClick={() => {
          const newScale = Math.min(10, scale + 0.1);
          scaleRef.current = newScale;
          setScale(newScale);
        }} title="Zoom In">+</button>
        <div className="zoom-controls__divider" />
        <button className="zoom-controls__btn" onClick={() => {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          let hasContent = false;
          for (const s of strokes) {
            const b = getStrokeBounds(s);
            if (b.minX === 0 && b.maxX === 0 && b.minY === 0 && b.maxY === 0) continue;
            hasContent = true;
            if (b.minX < minX) minX = b.minX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.maxY > maxY) maxY = b.maxY;
          }
          if (hasContent && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const padding = 50;
            const contentW = maxX - minX;
            const contentH = maxY - minY;
            const scaleX = (rect.width - padding * 2) / contentW;
            const scaleY = (rect.height - padding * 2) / contentH;
            let newScale = Math.min(scaleX, scaleY, 2);
            if (newScale < 0.1) newScale = 0.1;

            const newOffsetX = -minX * newScale + (rect.width - contentW * newScale) / 2;
            const newOffsetY = -minY * newScale + (rect.height - contentH * newScale) / 2;

            scaleRef.current = newScale;
            offsetRef.current = { x: newOffsetX, y: newOffsetY };
            setScale(newScale);
            setOffset({ x: newOffsetX, y: newOffsetY });
          } else {
            resetView();
          }
        }} title="Fit to Content">
          ⛶
        </button>
      </div>

      {/* Minimap Overlay */}
      <div className="minimap-container">
        <canvas
          ref={minimapCanvasRef}
          width={150}
          height={100}
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
          onPointerUp={handleMinimapPointerUp}
          style={{ touchAction: "none" }}
        />
      </div>

      {/* Canvas Scrollbars */}
      <div className="canvas-scrollbar canvas-scrollbar--h">
        <input
          type="range"
          min={scrollBounds.minX}
          max={scrollBounds.maxX}
          value={-offset.x / scale}
          step="any"
          onChange={(e) => {
            const worldX = parseFloat(e.target.value);
            const newOffsetX = -worldX * scale;
            offsetRef.current = { x: newOffsetX, y: offset.y };
            setOffset({ x: newOffsetX, y: offset.y });
          }}
        />
      </div>

      <div className="canvas-scrollbar canvas-scrollbar--v">
        <input
          type="range"
          min={scrollBounds.minY}
          max={scrollBounds.maxY}
          value={-offset.y / scale}
          step="any"
          onChange={(e) => {
            const worldY = parseFloat(e.target.value);
            const newOffsetY = -worldY * scale;
            offsetRef.current = { x: offset.x, y: newOffsetY };
            setOffset({ x: offset.x, y: newOffsetY });
          }}
        />
      </div>
    </div>
  );
});

export default BoarddoCanvas;
