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
  const [stickyColor, setStickyColor] = useState("#fef08aff");
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
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [profileName, setProfileName] = useState("");
  const whiteboardRef = useRef<WhiteboardRef>(null);
  const profilePopoverRef = useRef<HTMLDivElement>(null);

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

  // Targeted undo from another user — remove a single stroke
  const handleRemoveStroke = useCallback((strokeId: string) => {
    setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
  }, []);

  // Batch removal from another user — remove multiple strokes
  const handleRemoveStrokes = useCallback((strokeIds: string[]) => {
    const idSet = new Set(strokeIds);
    setStrokes((prev) => prev.filter((s) => !idSet.has(s.id)));
  }, []);

  const {
    isConnected,
    connectedUsers,
    remoteCursors,
    liveStrokes,
    userIdentity,
    lockedStrokes,
    emitStroke,
    emitUndo,
    emitRedoAdd,
    emitClear,
    emitCursor,
    emitDrawStart,
    emitDrawMove,
    emitDrawEnd,
    emitUpdateStroke,
    emitLockStroke,
    emitUnlockStroke,
    emitDeleteStrokes,
    emitChangeName,
  } = useSocket(
    activeBoardId,
    handleRemoteStroke,
    handleSyncStrokes,
    handleLoadStrokes,
    handleRemoteStrokeUpdate,
    handleRemoveStroke,
    handleRemoveStrokes
  );

  // ===== Identity Sync =====
  useEffect(() => {
    if (userIdentity) {
      const savedName = localStorage.getItem("boarddo_user_name");
      if (savedName && savedName !== userIdentity.name) {
        emitChangeName(savedName);
      }
      setProfileName(userIdentity.name);
    }
  }, [userIdentity, emitChangeName]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileName(e.target.value);
  }, []);

  const handleNameSubmit = useCallback(() => {
    const trimmed = profileName.trim();
    if (trimmed && userIdentity && trimmed !== userIdentity.name) {
      localStorage.setItem("boarddo_user_name", trimmed);
      emitChangeName(trimmed);
    }
    setShowProfilePopover(false);
  }, [profileName, userIdentity, emitChangeName]);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node)) {
        setShowProfilePopover(false);
      }
    }
    if (showProfilePopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showProfilePopover]);

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
       action.strokes.forEach((s) => emitRedoAdd(s));
    }
  }, [undoStack, emitUndo, emitUpdateStroke, emitRedoAdd]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, action]);

    if (action.type === "add") {
       setStrokes((prev) => [...prev, action.stroke]);
       emitRedoAdd(action.stroke);
    } else if (action.type === "update") {
       setStrokes((prev) => prev.map((s) => s.id === action.newStroke.id ? action.newStroke : s));
       emitUpdateStroke(action.newStroke);
    } else if (action.type === "delete") {
       const ids = new Set(action.strokes.map((s) => s.id));
       setStrokes((prev) => prev.filter((s) => !ids.has(s.id)));
       emitDeleteStrokes(action.strokes.map((s) => s.id));
    }
  }, [redoStack, emitRedoAdd, emitUpdateStroke, emitDeleteStrokes]);

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

  // Throttled emit for real-time drag updates
  const lastEmitTime = useRef<Record<string, number>>({});
  const handleStrokeUpdate = useCallback(
    (stroke: Stroke, originalStroke?: Stroke) => {
      if (originalStroke) {
        // Final update - always emit and record in undo history
        setUndoStack((prev) => [...prev, { type: "update", oldStroke: originalStroke, newStroke: stroke }]);
        setRedoStack([]);
        emitUpdateStroke(stroke);
      } else {
        // Intermediate (dragging) update - throttle to ~32ms (~30fps)
        const now = Date.now();
        if (!lastEmitTime.current[stroke.id] || now - lastEmitTime.current[stroke.id] > 32) {
          emitUpdateStroke(stroke);
          lastEmitTime.current[stroke.id] = now;
        }
      }
    },
    [emitUpdateStroke]
  );

  const handleStrokesDelete = useCallback(
    (deletedStrokes: Stroke[]) => {
      setUndoStack((prev) => [...prev, { type: "delete", strokes: deletedStrokes }]);
      setRedoStack([]);
      emitDeleteStrokes(deletedStrokes.map((s) => s.id));
    },
    [emitDeleteStrokes]
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
              <div className="top-bar__profile" ref={profilePopoverRef}>
                <div
                  className="top-bar__avatar top-bar__avatar--interactive"
                  style={{ backgroundColor: userIdentity.color }}
                  onClick={() => setShowProfilePopover(!showProfilePopover)}
                  title="Click to change name"
                >
                  {userIdentity.name.charAt(0).toUpperCase()}
                </div>

                {showProfilePopover && (
                  <div className="profile-popover">
                    <div className="profile-popover__title">Your Display Name</div>
                    <div className="profile-popover__input-group">
                      <input
                        type="text"
                        className="profile-popover__input"
                        value={profileName}
                        onChange={handleNameChange}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleNameSubmit();
                          if (e.key === "Escape") setShowProfilePopover(false);
                        }}
                        autoFocus
                        placeholder="Enter your name..."
                        maxLength={30}
                      />
                      <div className="profile-popover__hint">Press Enter to save</div>
                    </div>
                  </div>
                )}
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
        lockedStrokes={lockedStrokes}
        onCursorMove={handleCursorMove}
        onDrawStart={emitDrawStart}
        onDrawMove={emitDrawMove}
        onDrawEnd={emitDrawEnd}
        onToolChange={setTool}
        stickyColor={stickyColor}
        onColorPick={(c) => {
          setColor(c);
          setTool("pen");
        }}
        backgroundType={backgroundType}
        onLockStroke={emitLockStroke}
        onUnlockStroke={emitUnlockStroke}
      />

      {/* ===== Left Sidebar Toolbar + Bottom Actions ===== */}
      <Toolbar
        color={color}
        onColorChange={setColor}
        stickyColor={stickyColor}
        onStickyColorChange={setStickyColor}
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
