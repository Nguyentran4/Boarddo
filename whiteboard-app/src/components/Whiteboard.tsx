import { useRef, useEffect, useCallback, useState } from "react";
import type { RemoteCursor } from "../hooks/useSocket";

// ===== Types =====
export type ToolType = "pen" | "eraser" | "rect" | "circle" | "text" | "sticky";

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
  onStrokeUpdate?: (stroke: Stroke) => void;
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

// Sticky notes will use the currently selected tool color

export default function Whiteboard({
  color,
  brushSize,
  tool,
  onStrokeComplete,
  strokes,
  onStrokesChange,
  onStrokeUpdate,
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
      const newX = e.clientX - rect.left - dragState.offsetX;
      const newY = e.clientY - rect.top - dragState.offsetY;

      // Update the stroke position optimistically
      onStrokesChange(
        strokes.map((s) =>
          s.id === dragState.noteId
            ? { ...s, points: [{ x: Math.max(0, newX), y: Math.max(0, newY) }] }
            : s
        )
      );
    };

    const handleMouseUpDoc = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newX = e.clientX - rect.left - dragState.offsetX;
      const newY = e.clientY - rect.top - dragState.offsetY;

      const updatedStroke = strokes.find((s) => s.id === dragState.noteId);
      if (updatedStroke) {
        const finalStroke = {
          ...updatedStroke,
          points: [{ x: Math.max(0, newX), y: Math.max(0, newY) }],
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
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          setTextInput({
            visible: true,
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top,
            value: "",
            isSticky: false,
            color: color,
          });
        }
        return;
      }

      // Sticky tool: place sticky note at click position
      if (tool === "sticky") {
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          setTextInput({
            visible: true,
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top,
            value: "",
            isSticky: true,
            color: color,
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
        currentStroke.current.points = [shapeStart.current, point];

        const liveStrokeArray = Array.from(liveStrokes.values());
        redrawAll(canvas, strokes, liveStrokeArray);
        drawStroke(ctx, currentStroke.current);

        onDrawMove?.(currentStroke.current.id, [point], true);
      } else {
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

      if (currentStroke.current.points.length >= 2) {
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
      setDragState({
        noteId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
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
          onStrokeUpdate?.({ ...deleted, text: "" });
        }
      } else {
        const updated = strokes.find((s) => s.id === noteId);
        if (updated && updated.text !== editValue) {
          const updatedStroke = { ...updated, text: editValue };
          onStrokesChange(strokes.map((s) => (s.id === noteId ? updatedStroke : s)));
          onStrokeUpdate?.(updatedStroke);
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
  const getCursorStyle = () => {
    switch (tool) {
      case "text":
      case "sticky": return "crosshair";
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

      {/* ===== Note overlays (text + sticky) ===== */}
      {noteStrokes.map((note) => {
        const pos = note.points[0] || { x: 0, y: 0 };
        const isEditing = editingNoteId === note.id;
        const isDragging = dragState?.noteId === note.id;

        if (note.type === "sticky") {
          return (
            <div
              key={note.id}
              className={`note-overlay sticky-note ${isDragging ? "note-overlay--dragging" : ""}`}
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
            className={`note-overlay text-note ${isDragging ? "note-overlay--dragging" : ""}`}
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
