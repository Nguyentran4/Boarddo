import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Whiteboard from "../components/Whiteboard";
import type { WhiteboardRef, Stroke, ToolType } from "../components/Whiteboard";
import ExportModal from "../components/ExportModal";
import type { ExportOptions } from "../utils/export";
import Toolbar from "../components/Toolbar";
import { useSocket } from "../hooks/useSocket";

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();

  const [color, setColor] = useState("#e8e6f0");
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<ToolType>("select");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
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
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      emitUndo(last.id);
      return prev.slice(0, -1);
    });
  }, [emitUndo]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => [...s, last]);
      emitStroke(last);
      return prev.slice(0, -1);
    });
  }, [emitStroke]);

  const handleClear = useCallback(() => {
    if (strokes.length === 0) return;
    setRedoStack([]);
    setStrokes([]);
    emitClear();
  }, [strokes, emitClear]);

  const handleStrokesChange = useCallback((newStrokes: Stroke[]) => {
    setStrokes(newStrokes);
    setRedoStack([]);
  }, []);

  const handleStrokeComplete = useCallback(
    (stroke: Stroke) => {
      emitStroke(stroke);
    },
    [emitStroke]
  );

  const handleStrokeUpdate = useCallback(
    (stroke: Stroke) => {
      emitUpdateStroke(stroke);
    },
    [emitUpdateStroke]
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
      {/* Top Bar */}
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
            <div className="top-bar__logo-icon">🎨</div>
            <h1 className="top-bar__title">Boarddo</h1>
          </div>
        </div>

        <div className="top-bar__center">
          <div className="top-bar__board-id" id="board-id-display">
            <span className="top-bar__board-label">Board</span>
            <code className="top-bar__board-code">{activeBoardId}</code>
            <button
              className={`top-bar__copy-btn ${copied ? "top-bar__copy-btn--copied" : ""}`}
              onClick={handleCopyLink}
              title="Copy shareable link"
              id="btn-copy-link"
            >
              {copied ? "✓ Copied!" : "🔗 Share"}
            </button>
            <button
              className="top-bar__copy-btn"
              onClick={() => setShowExportModal(true)}
              style={{ marginLeft: '8px', backgroundColor: '#e2e8f0', color: '#1e293b' }}
              title="Export board"
              id="btn-export"
            >
              📥 Export
            </button>
          </div>
        </div>

        <div className="top-bar__status">
          {userIdentity && (
            <div className="top-bar__identity">
              <div
                className="top-bar__identity-dot"
                style={{ backgroundColor: userIdentity.color }}
              />
              <span>{userIdentity.name}</span>
            </div>
          )}
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
          <span>
            {isConnected ? "Connected" : "Offline"} · {strokes.length} stroke
            {strokes.length !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      {/* Canvas */}
      <Whiteboard
        ref={whiteboardRef}
        color={color}
        brushSize={brushSize}
        tool={tool}
        strokes={strokes}
        onStrokesChange={handleStrokesChange}
        onStrokeComplete={handleStrokeComplete}
        onStrokeUpdate={handleStrokeUpdate}
        remoteCursors={remoteCursors}
        liveStrokes={liveStrokes}
        onCursorMove={handleCursorMove}
        onDrawStart={emitDrawStart}
        onDrawMove={emitDrawMove}
        onDrawEnd={emitDrawEnd}
      />

      {/* Toolbar */}
      <Toolbar
        color={color}
        onColorChange={setColor}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        tool={tool}
        onToolChange={setTool}
        canUndo={strokes.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
      />

      {/* Keyboard shortcuts hint */}
      <div className="shortcuts-hint">
        <div className="shortcut">
          <span className="shortcut__key">V</span>
          <span>Select</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">P</span>
          <span>Pen</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">E</span>
          <span>Eraser</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">R</span>
          <span>Rectangle</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">C</span>
          <span>Circle</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">T</span>
          <span>Text</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">S</span>
          <span>Sticky</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">⌘Z</span>
          <span>Undo</span>
        </div>
      </div>
      
      {showExportModal && (
        <ExportModal 
           onClose={() => setShowExportModal(false)}
           onExport={handleExport}
        />
      )}
    </div>
  );
}
