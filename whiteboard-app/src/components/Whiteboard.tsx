import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { exportBoard } from "../utils/export";
import type { ExportOptions } from "../utils/export";
import type { RemoteCursor } from "../hooks/useSocket";

// ===== Types =====
export type ToolType = "select" | "pen" | "eraser" | "rect" | "circle" | "line" | "arrow" | "triangle" | "text" | "sticky" | "image";

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
}

interface WhiteboardProps {
  color: string;
  brushSize: number;
  tool: ToolType;
  onStrokeComplete?: (stroke: Stroke) => void;
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  onStrokeUpdate?: (stroke: Stroke, originalStroke?: Stroke) => void;
  onStrokesDelete?: (strokes: Stroke[]) => void;
  remoteCursors: Map<string, RemoteCursor>;
  liveStrokes: Map<string, Stroke>;
  onCursorMove?: (x: number, y: number) => void;
  onDrawStart?: (id: string, type: string, color: string, width: number, point: Point) => void;
  onDrawMove?: (id: string, points: Point[], isShape?: boolean) => void;
  onDrawEnd?: (id: string) => void;
  onToolChange?: (tool: ToolType) => void;
  backgroundType?: "none" | "grid" | "dots";
}

export interface WhiteboardRef {
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

function getStrokeBounds(stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } {
  if (stroke.points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  if (stroke.type === "text" || stroke.type === "sticky") {
    const el = document.getElementById(`note-${stroke.id}`);
    if (el) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const p = stroke.points[0];
      return { minX: p.x, minY: p.y, maxX: p.x + w, maxY: p.y + h };
    }
    const w = stroke.type === "sticky" ? 200 : 100;
    const h = stroke.type === "sticky" ? 200 : 40;
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

  if (stroke.type === "pen" || stroke.type === "eraser" || stroke.type === "rect" || stroke.type === "line" || stroke.type === "arrow") {
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

// Generate unique IDs for strokes
let strokeCounter = 0;
function generateStrokeId(): string {
  return `stroke-${Date.now()}-${strokeCounter++}`;
}

// Sticky notes will use the currently selected tool color

const Whiteboard = forwardRef<WhiteboardRef, WhiteboardProps>(({
  color,
  brushSize,
  tool,
  onStrokeComplete,
  strokes,
  onStrokesChange,
  onStrokeUpdate,
  onStrokesDelete,
  remoteCursors,
  liveStrokes,
  onCursorMove,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
  onToolChange,
  backgroundType = "none",
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const lastPoint = useRef<Point | null>(null);
  const animFrameId = useRef<number>(0);
  const pendingPoints = useRef<Point[]>([]);
  const shapeStart = useRef<Point | null>(null);

  // ===== Infinite Canvas Transform State =====
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  // Keep refs in sync for use in non-reactive callbacks
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

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
  }>({ visible: false, x: 0, y: 0, value: "", isSticky: false });
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Note interaction state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragState, setDragState] = useState<{
    noteId: string;
    offsetX: number;
    offsetY: number;
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
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        // Paste exactly at the center of the current screen view
        handleImageFile(e.clipboardData.files[0], rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleImageFile]);


  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  // Keyboard delete + spacebar tracking for panning
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        setSpaceHeld(true);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") {
          return;
        }
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
      
      // Ctrl+C (Copy)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedIds.size > 0 && !(e.ctrlKey && e.shiftKey)) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        clipboardRef.current = strokes.filter(s => selectedIds.has(s.id));
      }

      // Ctrl+V (Paste) or Ctrl+D (Duplicate)
      const isPaste = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v";
      const isDuplicate = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d";
      
      if (isPaste || isDuplicate) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        const srcStrokes = isDuplicate ? strokes.filter(s => selectedIds.has(s.id)) : clipboardRef.current;
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
  }, [strokes, selectedIds, onStrokesChange]);

  useEffect(() => {
    if (tool !== "select") {
      // Lock all currently selected canvas shapes when switching away from select
      if (selectedIds.size > 0) {
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
    }
  }, [tool]);

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

    redrawAll(canvas, strokes);
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
    // Text and sticky notes are rendered as DOM overlays, not on canvas
    if (stroke.type === "text" || stroke.type === "sticky") return;

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
    }

    ctx.restore();
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
    ctx.strokeRect(x, y, w, h);
  }

  function drawCircleStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const [center, edge] = stroke.points;
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
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
    // Fill with semi-transparent version of the stroke color
    if (stroke.color !== "eraser") {
      const fillColor = stroke.color + '33'; // ~20% opacity
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = stroke.color;
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

  // ===== Re-render when strokes, live strokes, or transform changes =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const liveStrokeArray = Array.from(liveStrokes.values());
      redrawAll(canvas, strokes, liveStrokeArray);
    }
  }, [strokes, liveStrokes, scale, offset]);

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
      editTextareaRef.current.focus();
      editTextareaRef.current.select();
    }
  }, [editingNoteId]);

  // ===== Note drag handlers (document-level) =====
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMoveDoc = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current - dragState.offsetX;
      const worldY = (e.clientY - rect.top - offsetRef.current.y) / scaleRef.current - dragState.offsetY;

      onStrokesChange(
        strokes.map((s) =>
          s.id === dragState.noteId
            ? { ...s, points: [{ x: worldX, y: worldY }] }
            : s
        )
      );
    };

    const handleMouseUpDoc = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current - dragState.offsetX;
      const worldY = (e.clientY - rect.top - offsetRef.current.y) / scaleRef.current - dragState.offsetY;

      const updatedStroke = strokes.find((s) => s.id === dragState.noteId);
      if (updatedStroke) {
        const finalStroke = {
          ...updatedStroke,
          points: [{ x: worldX, y: worldY }],
        };
        onStrokeUpdate?.(finalStroke);
      }

      setDragState(null);
    };

    document.addEventListener("mousemove", handleMouseMoveDoc);
    document.addEventListener("mouseup", handleMouseUpDoc);
    return () => {
      document.removeEventListener("mousemove", handleMouseMoveDoc);
      document.removeEventListener("mouseup", handleMouseUpDoc);
    };
  }, [dragState, strokes, onStrokesChange, onStrokeUpdate]);

  // ===== Pointer Events =====
  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    return screenToWorld(e.clientX, e.clientY);
  }

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      // Spacebar panning
      if (spaceHeldRef.current) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        panOffsetStart.current = { ...offsetRef.current };
        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      const point = getCanvasPoint(e);
      if (tool === "select") {
        let hitId = null;
        for (let i = strokes.length - 1; i >= 0; i--) {
          const s = strokes[i];
          if (!isSelectableStroke(s)) continue; // Only text/sticky are selectable
          const b = getStrokeBounds(s);
          if (pointInBounds(point, b, 5)) {
            hitId = s.id;
            break;
          }
        }

        if (hitId) {
          let newSelected = new Set(selectedIds);
          if (!e.shiftKey) {
            if (!newSelected.has(hitId)) {
              // Lock previously selected canvas shapes before selecting new one
              if (selectedIds.size > 0) {
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
            } else {
              newSelected.add(hitId);
            }
          }
          setSelectedIds(newSelected);

          isDraggingSelection.current = true;
          dragSelectionStart.current = point;
          dragOriginalStrokes.current = strokes.filter(s => newSelected.has(s.id));
        } else {
          if (!e.shiftKey) {
            // Lock any previously selected canvas shapes before clearing selection
            if (selectedIds.size > 0) {
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
          isCreatingSelectionBox.current = true;
          setSelectionBox({ start: point, end: point });
        }

        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
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

      // Sticky tool: place sticky note at click position (world coords)
      if (tool === "sticky") {
        const worldPt = screenToWorld(e.clientX, e.clientY);
        setTextInput({
          visible: true,
          x: worldPt.x,
          y: worldPt.y,
          value: "",
          isSticky: true,
          color: color,
        });
        return;
      }

      isDrawing.current = true;
      lastPoint.current = point;
      pendingPoints.current = [];
      shapeStart.current = (tool === "rect" || tool === "circle" || tool === "line" || tool === "arrow" || tool === "triangle") ? point : null;

      const strokeColor = tool === "eraser" ? "eraser" : color;

      currentStroke.current = {
        id: generateStrokeId(),
        type: tool,
        color: strokeColor,
        width: brushSize,
        points: [point],
      };

      // Emit draw-start to other users (include type so shapes render correctly)
      onDrawStart?.(currentStroke.current.id, tool, strokeColor, brushSize, point);

      canvasRef.current?.setPointerCapture(e.pointerId);
    },
    [color, brushSize, tool, onDrawStart, strokes, selectedIds, liveStrokes]
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

      const point = getCanvasPoint(e);

      setCursorPos({ x: e.clientX, y: e.clientY });

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        onCursorMove?.(point.x / rect.width, point.y / rect.height);
      }


      if (tool === "select") {
        if (isDraggingSelection.current && dragSelectionStart.current) {
          const dx = point.x - dragSelectionStart.current.x;
          const dy = point.y - dragSelectionStart.current.y;

          const movedStrokes = dragOriginalStrokes.current.map(orig => {
            const newPoints = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
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
              redrawAll(canvas, newStrokes, liveStrokeArray);
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

          if (scaleX === 0) scaleX = 0.01;
          if (scaleY === 0) scaleY = 0.01;

          const movedStrokes = dragOriginalStrokes.current.map(orig => {
            const newPoints = orig.points.map(p => ({
              x: originX + (p.x - originX) * scaleX,
              y: originY + (p.y - originY) * scaleY
            }));
            return { ...orig, points: newPoints, width: orig.width * Math.max(scaleX, scaleY) };
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
              redrawAll(canvas, newStrokes, liveStrokeArray);
              movedStrokes.forEach(s => {
                const el = document.getElementById(`note-${s.id}`);
                if (el && s.points[0]) {
                  el.style.left = s.points[0].x + 'px';
                  el.style.top = s.points[0].y + 'px';
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

      const isShape = tool === "rect" || tool === "circle" || tool === "line" || tool === "arrow" || tool === "triangle";

      if (isShape && shapeStart.current) {
        // Shift-snap for line/arrow: lock to 0°/45°/90° angles
        let drawPoint = point;
        if (e.shiftKey && (tool === "line" || tool === "arrow")) {
          drawPoint = snapAngle(shapeStart.current, point);
        }
        currentStroke.current.points = [shapeStart.current, drawPoint];

        const liveStrokeArray = Array.from(liveStrokes.values());
        redrawAll(canvas, strokes, liveStrokeArray);
        // Draw in-progress shape in world-transform space
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, dpr * offsetRef.current.x, dpr * offsetRef.current.y);
        drawStroke(ctx, currentStroke.current);
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
    [onCursorMove, onDrawMove, tool, strokes, liveStrokes, selectedIds]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {

      // Stop panning
      if (isPanning.current) {
        isPanning.current = false;
        canvasRef.current?.releasePointerCapture(e.pointerId);
        return;
      }

      if (tool === "select") {
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

      const isShape = tool === "rect" || tool === "circle" || tool === "line" || tool === "arrow" || tool === "triangle";

      if (currentStroke.current.points.length >= 2) {
        if (isShape) {
          let finalPoint = getCanvasPoint(e);
          if (e.shiftKey && (tool === "line" || tool === "arrow") && shapeStart.current) {
            finalPoint = snapAngle(shapeStart.current, finalPoint);
          }
          currentStroke.current.points = [shapeStart.current!, finalPoint];
        }

        const completedStroke = { ...currentStroke.current, locked: !isShape };
        const newStrokes = [...strokes, completedStroke];
        onStrokesChange(newStrokes);
        onStrokeComplete?.(completedStroke);

        // Auto-select the new shape and switch to select tool so user can move it
        if (isShape) {
          setSelectedIds(new Set([completedStroke.id]));
          onToolChange?.("select");
        }

        const canvas = canvasRef.current;
        if (canvas) {
          cancelAnimationFrame(animFrameId.current);
          animFrameId.current = requestAnimationFrame(() => {
            const liveStrokeArray = Array.from(liveStrokes.values());
            redrawAll(canvas, newStrokes, liveStrokeArray);
          });
        }
      }

      currentStroke.current = null;
      lastPoint.current = null;
      shapeStart.current = null;
      pendingPoints.current = [];
    },
    [strokes, liveStrokes, onStrokesChange, onStrokeComplete, onDrawEnd, tool, selectedIds, selectionBox]
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
    if (!textInput.value.trim()) {
      setTextInput((prev) => ({ ...prev, visible: false }));
      return;
    }

    const noteStroke: Stroke = {
      id: generateStrokeId(),
      type: textInput.isSticky ? "sticky" : "text",
      color: textInput.color || color,
      width: brushSize,
      points: [{ x: textInput.x, y: textInput.y }],
      text: textInput.value,
    };

    const newStrokes = [...strokes, noteStroke];
    onStrokesChange(newStrokes);
    onStrokeComplete?.(noteStroke);

    setTextInput({ visible: false, x: 0, y: 0, value: "", isSticky: false });
  }, [textInput, color, brushSize, strokes, onStrokesChange, onStrokeComplete]);

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleTextSubmit();
      }
      if (e.key === "Escape") {
        setTextInput({ visible: false, x: 0, y: 0, value: "", isSticky: false });
      }
      e.stopPropagation();
    },
    [handleTextSubmit]
  );

  // ===== Note Interaction Handlers =====
  const handleNoteMouseDown = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      if (editingNoteId === noteId) return; // Don't drag while editing
      e.preventDefault();
      e.stopPropagation();
      const noteEl = (e.currentTarget as HTMLElement);
      const rect = noteEl.getBoundingClientRect();
      // Offset in world coordinates
      setDragState({
        noteId,
        offsetX: (e.clientX - rect.left) / scaleRef.current,
        offsetY: (e.clientY - rect.top) / scaleRef.current,
      });
    },
    [editingNoteId]
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
    [editValue, strokes, onStrokesChange, onStrokeUpdate]
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

  const getCursorStyle = () => {
    if (spaceHeld) return isPanning.current ? 'grabbing' : 'grab';
    switch (tool) {
      case "text":
      case "sticky": return "crosshair";
      case "rect":
      case "circle":
      case "line":
      case "arrow":
      case "triangle": return "crosshair";
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

  const resetView = useCallback(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setScale(1);
    setOffset({ x: 0, y: 0 });
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
            return (
              <div
                key={note.id}
                id={`note-${note.id}`}
                className={`note-overlay sticky-note ${isDragging ? "note-overlay--dragging" : ""} ${selectedIds.has(note.id) ? "note-overlay--selected" : ""}`}
                style={{
                  left: pos.x,
                  top: pos.y,
                  backgroundColor: note.color,
                }}
                onMouseDown={(e) => handleNoteMouseDown(e, note.id)}
                onDoubleClick={(e) => handleNoteDoubleClick(e, note.id)}
              >
                <div className="sticky-note__header">
                  <div className="sticky-note__grip">⠿</div>
                </div>
                {isEditing ? (
                  <textarea
                    ref={editTextareaRef}
                    className="sticky-note__textarea"
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
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="sticky-note__text">{note.text}</div>
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
                color: note.color,
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
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-note__content">{note.text}</span>
              )}
            </div>
          );
        })}

        {/* ===== Image overlays ===== */}
        {strokes.filter(s => s.type === "image").map(imgStroke => {
          const p1 = imgStroke.points[0];
          const p2 = imgStroke.points[1] || p1; 
          const w = Math.abs(p2.x - p1.x);
          const h = Math.abs(p2.y - p1.y);
          const left = Math.min(p1.x, p2.x);
          const top = Math.min(p1.y, p2.y);

          return (
            <img
              key={imgStroke.id}
              id={`note-${imgStroke.id}`}
              src={imgStroke.imageUrl}
              className={`image-overlay ${selectedIds.has(imgStroke.id) ? "note-overlay--selected" : ""}`}
              style={{
                position: 'absolute',
                left: left,
                top: top,
                width: w,
                height: h,
                objectFit: 'contain',
                pointerEvents: 'none', 
                userSelect: 'none', 
                boxShadow: selectedIds.has(imgStroke.id) ? '0 0 0 2px #3b82f6' : 'none'
              }}
            />
          );
        })}

        {/* Text/Sticky creation input */}
        {textInput.visible && (
          <div
            className={textInput.isSticky ? "note-creation sticky-note" : "note-creation text-creation"}
            style={{
              left: textInput.x,
              top: textInput.y,
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
              rows={textInput.isSticky ? 4 : 1}
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

        {/* Selected Items Bounds Overlays */}
        {tool === "select" && Array.from(selectedIds).map(id => {
          const s = strokes.find(st => st.id === id);
          if (!s || !isSelectableStroke(s)) return null; // Only text/sticky get bounds
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

      {/* Zoom indicator + Reset View */}
      <div className="zoom-controls">
        <span className="zoom-controls__level">{Math.round(scale * 100)}%</span>
        {(scale !== 1 || offset.x !== 0 || offset.y !== 0) && (
          <button className="zoom-controls__reset" onClick={resetView} title="Reset view">
            ⟲ Reset
          </button>
        )}
      </div>
    </div>
  );
});

export default Whiteboard;
