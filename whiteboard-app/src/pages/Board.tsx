import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Whiteboard from "../components/Whiteboard";
import type { WhiteboardRef, Stroke, ToolType } from "../components/Whiteboard";
import ExportModal from "../components/ExportModal";
import type { ExportOptions } from "../utils/export";
import Toolbar from "../components/Toolbar";
import { useSocket } from "../hooks/useSocket";
import logoImage from "../assets/logo.png";
type HistoryAction =
  | { type: "add"; stroke: Stroke }
  | { type: "update"; oldStroke: Stroke; newStroke: Stroke }
  | { type: "delete"; strokes: Stroke[] };

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();

  const [color, setColor] = useState("#000000ff");
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<ToolType>("select");
  const [fillStyle, setFillStyle] = useState<"outline" | "solid" | "semi">("outline");
  const [strokeStyle, setStrokeStyle] = useState<"solid" | "dashed" | "dotted">("solid");
  const [backgroundType, setBackgroundType] = useState<"none" | "grid" | "dots">("none");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);
  const [copied, setCopied] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const whiteboardRef = useRef<WhiteboardRef>(null);

  // Track stroke count for status display
  const strokeCountRef = useRef(0);
  strokeCountRef.current = strokes.length;

  // Guard against missing boardId
  const activeBoardId = boardId || "default";

  // ===== Socket.io Integration =====
  const handleRemoteStroke = useCallback((stroke: Stroke) => {
    setStrokes((prev) => [...prev, stroke]);
  }, []);

  const handleSyncStrokes = useCallback((syncedStrokes: Stroke[]) => {
    setStrokes(syncedStrokes);
    setRedoStack([]);
    setUndoStack([]);
  }, []);

  const handleLoadStrokes = useCallback((loadedStrokes: Stroke[]) => {
    setStrokes(loadedStrokes);
  }, []);

  const handleRemoteStrokeUpdate = useCallback((updatedStroke: Stroke) => {
    setStrokes((prev) =>
      prev.map((s) => (s.id === updatedStroke.id ? updatedStroke : s))
    );
  }, []);

  const {
    isConnected,
    connectedUsers,
    remoteCursors,
    liveStrokes,
    userIdentity,
    emitStroke,
    emitUndo,
    emitClear,
    emitCursor,
    emitDrawStart,
    emitDrawMove,
    emitDrawEnd,
    emitUpdateStroke,
  } = useSocket(
    activeBoardId,
    handleRemoteStroke,
    handleSyncStrokes,
    handleLoadStrokes,
    handleRemoteStrokeUpdate
  );

  // ===== Cursor Presence =====
  const handleCursorMove = useCallback(
    (x: number, y: number) => {
      emitCursor(x, y);
    },
    [emitCursor]
  );

  // ===== Undo / Redo =====
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, action]);

    if (action.type === "add") {
       setStrokes((prev) => prev.filter((s) => s.id !== action.stroke.id));
       emitUndo(action.stroke.id);
    } else if (action.type === "update") {
       setStrokes((prev) => prev.map((s) => s.id === action.oldStroke.id ? action.oldStroke : s));
       emitUpdateStroke(action.oldStroke);
    } else if (action.type === "delete") {
       setStrokes((prev) => [...prev, ...action.strokes]);
       action.strokes.forEach((s) => emitStroke(s));
    }
  }, [undoStack, emitUndo, emitUpdateStroke, emitStroke]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, action]);

    if (action.type === "add") {
       setStrokes((prev) => [...prev, action.stroke]);
       emitStroke(action.stroke);
    } else if (action.type === "update") {
       setStrokes((prev) => prev.map((s) => s.id === action.newStroke.id ? action.newStroke : s));
       emitUpdateStroke(action.newStroke);
    } else if (action.type === "delete") {
       const ids = new Set(action.strokes.map((s) => s.id));
       setStrokes((prev) => prev.filter((s) => !ids.has(s.id)));
       action.strokes.forEach((s) => emitUndo(s.id));
    }
  }, [redoStack, emitStroke, emitUpdateStroke, emitUndo]);

  const handleClear = useCallback(() => {
    if (strokes.length === 0) return;
    setUndoStack([]);
    setRedoStack([]);
    setStrokes([]);
    emitClear();
  }, [strokes, emitClear]);

  const handleStrokesChange = useCallback((newStrokes: Stroke[]) => {
    setStrokes(newStrokes);
  }, []);

  const handleStrokeComplete = useCallback(
    (stroke: Stroke) => {
      setUndoStack((prev) => [...prev, { type: "add", stroke }]);
      setRedoStack([]);
      emitStroke(stroke);
    },
    [emitStroke]
  );

  const handleStrokeUpdate = useCallback(
    (stroke: Stroke, originalStroke?: Stroke) => {
      if (originalStroke) {
        setUndoStack((prev) => [...prev, { type: "update", oldStroke: originalStroke, newStroke: stroke }]);
        setRedoStack([]);
      }
      emitUpdateStroke(stroke);
    },
    [emitUpdateStroke]
  );

  const handleStrokesDelete = useCallback(
    (deletedStrokes: Stroke[]) => {
      setUndoStack((prev) => [...prev, { type: "delete", strokes: deletedStrokes }]);
      setRedoStack([]);
      deletedStrokes.forEach((s) => emitUndo(s.id));
    },
    [emitUndo]
  );

  // ===== Copy board link =====
  const handleCopyLink = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  // ===== Keyboard Shortcuts =====
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === "v" && !e.ctrlKey && !e.metaKey) {
        setTool("select");
      }
      if (e.key === "p" && !e.ctrlKey && !e.metaKey) {
        setTool("pen");
      }
      if (e.key === "e" && !e.ctrlKey && !e.metaKey) {
        setTool("eraser");
      }
      if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
        setTool("rect");
      }
      if (e.key === "c" && !e.ctrlKey && !e.metaKey) {
        setTool("circle");
      }
      if (e.key === "l" && !e.ctrlKey && !e.metaKey) {
        setTool("line");
      }
      if (e.key === "a" && !e.ctrlKey && !e.metaKey) {
        setTool("arrow");
      }
      if (e.key === "g" && !e.ctrlKey && !e.metaKey) {
        setTool("triangle");
      }
      if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
        setTool("text");
      }
      if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        setTool("sticky");
      }
      if (e.key === "[") {
        setBrushSize((s) => Math.max(1, s - 2));
      }
      if (e.key === "]") {
        setBrushSize((s) => Math.min(32, s + 2));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleExport = useCallback((options: ExportOptions) => {
    whiteboardRef.current?.exportCanvas(options);
  }, []);

  return (
    <div className="app">
      {/* ===== Top Bar (Glassmorphism) ===== */}
      <header className="top-bar" id="top-bar">
        <div className="top-bar__left">
          <button
            className="top-bar__back"
            onClick={() => navigate("/")}
            title="Back to Home"
            id="btn-home"
          >
            ←
          </button>
          <div className="top-bar__logo">
            <img src={logoImage} alt="Boarddo Logo" className="top-bar__logo-img" />
            <h1 className="top-bar__title">Boarddo</h1>
          </div>
        </div>

        <div className="top-bar__center">
          <div className="top-bar__board-id" id="board-id-display">
            <span className="top-bar__board-label">Board</span>
            <code className="top-bar__board-code">{activeBoardId}</code>
          </div>
        </div>

        <div className="top-bar__right">
          <button
            className={`top-bar__action-btn ${copied ? "top-bar__action-btn--copied" : ""}`}
            onClick={handleCopyLink}
            title="Copy shareable link"
            id="btn-copy-link"
          >
            {copied ? "✓ Copied!" : "🔗 Share"}
          </button>
          <button
            className="top-bar__action-btn"
            onClick={() => setShowExportModal(true)}
            title="Export board"
            id="btn-export"
          >
            📥 Export
          </button>

          <div className="top-bar__separator" />

          <div className="top-bar__status-area">
            <div className="top-bar__users">
              <span className="top-bar__users-icon">👥</span>
              <span>{connectedUsers}</span>
            </div>
            <div
              className="top-bar__status-dot"
              style={{
                background: isConnected ? "#4ade80" : "#f87171",
                boxShadow: isConnected
                  ? "0 0 6px rgba(74, 222, 128, 0.5)"
                  : "0 0 6px rgba(248, 113, 113, 0.5)",
              }}
            />
            {userIdentity && (
              <div
                className="top-bar__avatar"
                style={{ backgroundColor: userIdentity.color }}
                title={userIdentity.name}
              >
                {userIdentity.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== Canvas ===== */}
      <Whiteboard
        ref={whiteboardRef}
        color={color}
        brushSize={brushSize}
        tool={tool}
        fillStyle={fillStyle}
        strokeStyle={strokeStyle}
        strokes={strokes}
        onStrokesChange={handleStrokesChange}
        onStrokeComplete={handleStrokeComplete}
        onStrokeUpdate={handleStrokeUpdate}
        onStrokesDelete={handleStrokesDelete}
        remoteCursors={remoteCursors}
        liveStrokes={liveStrokes}
        onCursorMove={handleCursorMove}
        onDrawStart={emitDrawStart}
        onDrawMove={emitDrawMove}
        onDrawEnd={emitDrawEnd}
        onToolChange={setTool}
        backgroundType={backgroundType}
      />

      {/* ===== Left Sidebar Toolbar + Bottom Actions ===== */}
      <Toolbar
        color={color}
        onColorChange={setColor}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        tool={tool}
        onToolChange={setTool}
        fillStyle={fillStyle}
        onFillStyleChange={setFillStyle}
        strokeStyle={strokeStyle}
        onStrokeStyleChange={setStrokeStyle}
        backgroundType={backgroundType}
        onBackgroundTypeChange={setBackgroundType}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
      />

      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}
    </div>
  );
}
