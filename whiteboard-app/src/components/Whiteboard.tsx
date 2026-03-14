import { useRef, useEffect, useCallback, useState } from "react";

// ===== Types =====
export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: Point[];
}

interface WhiteboardProps {
  color: string;
  brushSize: number;
  tool: "pen" | "eraser";
  onStrokeComplete?: (stroke: Stroke) => void;
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
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
}: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const lastPoint = useRef<Point | null>(null);
  const animFrameId = useRef<number>(0);

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

    // Re-render all strokes after resize
    redrawAll(canvas, strokes);
  }, [strokes]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // ===== Drawing Helpers =====
  function redrawAll(canvas: HTMLCanvasElement, allStrokes: Stroke[]) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    for (const stroke of allStrokes) {
      drawStroke(ctx, stroke);
    }
  }

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.width;

    // Eraser strokes use destination-out compositing
    if (stroke.color === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color;
    }

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    // Smooth curve through points using quadratic bezier
    for (let i = 1; i < stroke.points.length - 1; i++) {
      const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, midX, midY);
    }

    // Last point
    const last = stroke.points[stroke.points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }

  // Draw a live segment as user moves (for real-time feedback)
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

  // ===== Re-render when strokes change externally =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      redrawAll(canvas, strokes);
    }
  }, [strokes]);

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
      isDrawing.current = true;
      lastPoint.current = point;

      const strokeColor = tool === "eraser" ? "eraser" : color;

      currentStroke.current = {
        id: generateStrokeId(),
        color: strokeColor,
        width: brushSize,
        points: [point],
      };

      // Capture pointer for smooth tracking even outside canvas
      canvasRef.current?.setPointerCapture(e.pointerId);
    },
    [color, brushSize, tool]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(e);

      // Always update cursor position
      setCursorPos({ x: e.clientX, y: e.clientY });

      if (!isDrawing.current || !currentStroke.current || !lastPoint.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw live segment for immediate feedback
      drawLiveSegment(ctx, lastPoint.current, point, currentStroke.current.color, currentStroke.current.width);

      currentStroke.current.points.push(point);
      lastPoint.current = point;
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current || !currentStroke.current) return;

      isDrawing.current = false;
      canvasRef.current?.releasePointerCapture(e.pointerId);

      // Only add strokes with at least 2 points
      if (currentStroke.current.points.length >= 2) {
        const completedStroke = { ...currentStroke.current };
        const newStrokes = [...strokes, completedStroke];
        onStrokesChange(newStrokes);
        onStrokeComplete?.(completedStroke);

        // Redraw cleanly with the smooth curve rendering
        const canvas = canvasRef.current;
        if (canvas) {
          cancelAnimationFrame(animFrameId.current);
          animFrameId.current = requestAnimationFrame(() => {
            redrawAll(canvas, newStrokes);
          });
        }
      }

      currentStroke.current = null;
      lastPoint.current = null;
    },
    [strokes, onStrokesChange, onStrokeComplete]
  );

  const handlePointerEnter = useCallback(() => setShowCursor(true), []);
  const handlePointerLeave = useCallback(() => {
    setShowCursor(false);
    // If user leaves canvas while drawing, finish the stroke
    if (isDrawing.current && currentStroke.current) {
      isDrawing.current = false;
      if (currentStroke.current.points.length >= 2) {
        const completedStroke = { ...currentStroke.current };
        const newStrokes = [...strokes, completedStroke];
        onStrokesChange(newStrokes);
      }
      currentStroke.current = null;
      lastPoint.current = null;
    }
  }, [strokes, onStrokesChange]);

  return (
    <div className="canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={{ touchAction: "none" }}
      />

      {/* Custom cursor indicator */}
      {showCursor && cursorPos && (
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
    </div>
  );
}
