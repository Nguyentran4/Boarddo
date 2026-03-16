import { useRef, useEffect, useCallback, useState } from "react";
import type { RemoteCursor } from "../hooks/useSocket";

// ===== Types =====
export type ToolType = "pen" | "eraser" | "rect" | "circle" | "text";

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
}

interface WhiteboardProps {
  color: string;
  brushSize: number;
  tool: ToolType;
  onStrokeComplete?: (stroke: Stroke) => void;
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  remoteCursors: Map<string, RemoteCursor>;
  liveStrokes: Map<string, Stroke>;
  onCursorMove?: (x: number, y: number) => void;
  onDrawStart?: (id: string, type: string, color: string, width: number, point: Point) => void;
  onDrawMove?: (id: string, points: Point[], isShape?: boolean) => void;
  onDrawEnd?: (id: string) => void;
}

// Generate unique IDs for strokes
let strokeCounter = 0;
function generateStrokeId(): string {
  return `stroke-${Date.now()}-${strokeCounter++}`;
}

export default function Whiteboard({
  color,
  brushSize,
  tool,
  onStrokeComplete,
  strokes,
  onStrokesChange,
  remoteCursors,
  liveStrokes,
  onCursorMove,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
}: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const lastPoint = useRef<Point | null>(null);
  const animFrameId = useRef<number>(0);
  const pendingPoints = useRef<Point[]>([]);
  const shapeStart = useRef<Point | null>(null);

  // Text input state
  const [textInput, setTextInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
    value: string;
  }>({ visible: false, x: 0, y: 0, value: "" });
  const textInputRef = useRef<HTMLInputElement>(null);

  // Cursor indicator state
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [showCursor, setShowCursor] = useState(false);

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

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

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

    ctx.clearRect(0, 0, w, h);

    for (const stroke of allStrokes) {
      drawStroke(ctx, stroke);
    }

    if (extraStrokes) {
      for (const stroke of extraStrokes) {
        drawStroke(ctx, stroke);
      }
    }
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
      case "text":
        drawTextStroke(ctx, stroke);
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

  function drawTextStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (!stroke.text || stroke.points.length < 1) return;
    const p = stroke.points[0];
    const fontSize = Math.max(14, stroke.width * 4);
    ctx.font = `${fontSize}px 'Inter', 'Segoe UI', sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(stroke.text, p.x, p.y);
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

  // ===== Re-render when strokes or live strokes change =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const liveStrokeArray = Array.from(liveStrokes.values());
      redrawAll(canvas, strokes, liveStrokeArray);
    }
  }, [strokes, liveStrokes]);

  // ===== Focus text input when visible =====
  useEffect(() => {
    if (textInput.visible && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput.visible]);

  // ===== Pointer Events =====
  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const point = getCanvasPoint(e);

      // Text tool: place input at click position
      if (tool === "text") {
        // Get canvas-relative offset for the input position
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          setTextInput({
            visible: true,
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top,
            value: "",
          });
        }
        return;
      }

      isDrawing.current = true;
      lastPoint.current = point;
      pendingPoints.current = [];
      shapeStart.current = (tool === "rect" || tool === "circle") ? point : null;

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
    [color, brushSize, tool, onDrawStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(e);

      setCursorPos({ x: e.clientX, y: e.clientY });

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        onCursorMove?.(point.x / rect.width, point.y / rect.height);
      }

      if (!isDrawing.current || !currentStroke.current || !lastPoint.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const isShape = tool === "rect" || tool === "circle";

      if (isShape && shapeStart.current) {
        // For shapes, update the second point and redraw preview
        currentStroke.current.points = [shapeStart.current, point];

        // Full redraw with shape preview
        const liveStrokeArray = Array.from(liveStrokes.values());
        redrawAll(canvas, strokes, liveStrokeArray);
        drawStroke(ctx, currentStroke.current);

        // Emit the shape preview to remote users (isShape=true so receiver replaces points)
        onDrawMove?.(currentStroke.current.id, [point], true);
      } else {
        // Pen / eraser: draw live segment
        drawLiveSegment(ctx, lastPoint.current, point, currentStroke.current.color, currentStroke.current.width);

        currentStroke.current.points.push(point);
        lastPoint.current = point;

        pendingPoints.current.push(point);
        onDrawMove?.(currentStroke.current.id, pendingPoints.current);
        pendingPoints.current = [];
      }
    },
    [onCursorMove, onDrawMove, tool, strokes, liveStrokes]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current || !currentStroke.current) return;

      isDrawing.current = false;
      canvasRef.current?.releasePointerCapture(e.pointerId);

      onDrawEnd?.(currentStroke.current.id);

      const isShape = tool === "rect" || tool === "circle";
      const minPoints = isShape ? 2 : 2;

      if (currentStroke.current.points.length >= minPoints) {
        // For shapes, make sure we have the final endpoint
        if (isShape) {
          const finalPoint = getCanvasPoint(e);
          currentStroke.current.points = [shapeStart.current!, finalPoint];
        }

        const completedStroke = { ...currentStroke.current };
        const newStrokes = [...strokes, completedStroke];
        onStrokesChange(newStrokes);
        onStrokeComplete?.(completedStroke);

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
    [strokes, liveStrokes, onStrokesChange, onStrokeComplete, onDrawEnd, tool]
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

  // ===== Text Input Handlers =====
  const handleTextSubmit = useCallback(() => {
    if (!textInput.value.trim()) {
      setTextInput((prev) => ({ ...prev, visible: false }));
      return;
    }

    // Convert the input position back to canvas coordinates
    const container = containerRef.current;
    if (!container) return;

    const textStroke: Stroke = {
      id: generateStrokeId(),
      type: "text",
      color,
      width: brushSize,
      points: [{ x: textInput.x, y: textInput.y }],
      text: textInput.value,
    };

    const newStrokes = [...strokes, textStroke];
    onStrokesChange(newStrokes);
    onStrokeComplete?.(textStroke);

    setTextInput({ visible: false, x: 0, y: 0, value: "" });
  }, [textInput, color, brushSize, strokes, onStrokesChange, onStrokeComplete]);

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTextSubmit();
      }
      if (e.key === "Escape") {
        setTextInput({ visible: false, x: 0, y: 0, value: "" });
      }
      // Prevent keyboard shortcuts while typing
      e.stopPropagation();
    },
    [handleTextSubmit]
  );

  // Convert remote cursors map to array for rendering
  const remoteCursorList = Array.from(remoteCursors.values());

  // Determine cursor style based on tool
  const getCursorStyle = () => {
    switch (tool) {
      case "text": return "text";
      case "rect":
      case "circle": return "crosshair";
      default: return "none";
    }
  };

  return (
    <div className="canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={{ touchAction: "none", cursor: getCursorStyle() }}
      />

      {/* Custom cursor indicator (local user, pen/eraser only) */}
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

      {/* Text input overlay */}
      {textInput.visible && (
        <input
          ref={textInputRef}
          className="canvas-text-input"
          style={{
            left: textInput.x,
            top: textInput.y,
            color: color,
            fontSize: `${Math.max(14, brushSize * 4)}px`,
          }}
          value={textInput.value}
          onChange={(e) =>
            setTextInput((prev) => ({ ...prev, value: e.target.value }))
          }
          onKeyDown={handleTextKeyDown}
          onBlur={handleTextSubmit}
          placeholder="Type here..."
        />
      )}

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
    </div>
  );
}
