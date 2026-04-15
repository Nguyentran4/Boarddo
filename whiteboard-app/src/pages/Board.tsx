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

const CURSOR_COLORS = [
  "#6c63ff", "#ff6b9d", "#4ade80", "#38bdf8", "#facc15", "#fb923c",
  "#f87171", "#a78bfa", "#34d399", "#f472b6", "#60a5fa", "#fbbf24",
];

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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [boardPassword, setBoardPassword] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [showUserListPopover, setShowUserListPopover] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileColor, setProfileColor] = useState("");
  const whiteboardRef = useRef<WhiteboardRef>(null);
  const profilePopoverRef = useRef<HTMLDivElement>(null);
  const userListPopoverRef = useRef<HTMLDivElement>(null);

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

  const handleJoinFailed = useCallback((reason: string) => {
    if (reason === "invalid_password") {
      setShowPasswordPrompt(true);
    }
  }, []);

  const handleBoardPrivacyChanged = useCallback((hasPassword: boolean) => {
    setBoardPassword(hasPassword ? "protected" : null);
  }, []);

  const {
    isConnected,
    remoteCursors,
    liveStrokes,
    userIdentity,
    boardUsers,
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
    emitUpdateIdentity,
    emitSetBoardPassword,
    rejoinBoard,
  } = useSocket(
    activeBoardId,
    handleRemoteStroke,
    handleSyncStrokes,
    handleLoadStrokes,
    handleRemoteStrokeUpdate,
    handleRemoveStroke,
    handleRemoveStrokes,
    boardPassword || undefined,
    handleJoinFailed,
    handleBoardPrivacyChanged
  );

  const handlePasswordSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setBoardPassword(passwordInput);
    setPasswordInput("");
    setShowPasswordPrompt(false);
    // Rejoin with the new password
    rejoinBoard(passwordInput);
  }, [passwordInput, rejoinBoard]);

  const handleSetPassword = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    emitSetBoardPassword(activeBoardId, newPassword || null);
    setNewPassword("");
    setShowPasswordModal(false);
  }, [activeBoardId, newPassword, emitSetBoardPassword]);

  const handleRemovePassword = useCallback(() => {
    emitSetBoardPassword(activeBoardId, null);
    setBoardPassword(null);
  }, [activeBoardId, emitSetBoardPassword]);

  // ===== Identity Sync =====
  useEffect(() => {
    if (userIdentity) {
      setProfileName(userIdentity.name);
      setProfileColor(userIdentity.color);
    }
  }, [userIdentity]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileName(e.target.value);
  }, []);

  const handleColorChange = useCallback((color: string) => {
    setProfileColor(color);
    if (userIdentity) {
      localStorage.setItem("boarddo_user_color", color);
      emitUpdateIdentity(profileName.trim() || userIdentity.name, color);
    }
  }, [profileName, userIdentity, emitUpdateIdentity]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = profileName.trim();
    if (trimmed && userIdentity && (trimmed !== userIdentity.name || profileColor !== userIdentity.color)) {
      localStorage.setItem("boarddo_user_name", trimmed);
      localStorage.setItem("boarddo_user_color", profileColor);
      emitUpdateIdentity(trimmed, profileColor);
    }
    setShowProfilePopover(false);
  }, [profileName, profileColor, userIdentity, emitUpdateIdentity]);

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

  // Close user list popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userListPopoverRef.current && !userListPopoverRef.current.contains(e.target as Node)) {
        setShowUserListPopover(false);
      }
    }
    if (showUserListPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUserListPopover]);

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
    setShowClearConfirm(false);
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
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

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
          <button
            className={`top-bar__action-btn ${boardPassword ? "top-bar__action-btn--protected" : ""}`}
            onClick={() => setShowPasswordModal(true)}
            title={boardPassword ? "Board is protected" : "Set board privacy"}
            id="btn-privacy"
          >
            {boardPassword ? "🔒 Protected" : "🔓 Public"}
          </button>

          <div className="top-bar__separator" />

          <div className="top-bar__status-area">
            <div
              className="top-bar__users top-bar__users--interactive"
              onMouseEnter={() => setShowUserListPopover(true)}
              onMouseLeave={() => setShowUserListPopover(false)}
              ref={userListPopoverRef}
              id="top-bar-users-count"
            >
              <span className="top-bar__users-icon">👥</span>
              <span>{boardUsers.size}</span>

              {showUserListPopover && (
                <div className="user-list-popover">
                  {Array.from(boardUsers.values()).map((user) => (
                    <div
                      key={user.id}
                      className={`user-item ${user.id === userIdentity?.id ? 'user-item--me' : ''} ${user.isAway ? 'user-item--away' : ''}`}
                    >
                      <div
                        className="user-item__avatar"
                        style={{ backgroundColor: user.color }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-item__info">
                        <div className="user-item__name">{user.name}</div>
                        {user.isAway && <div className="user-item__status">Stepped Away</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                          e.stopPropagation();
                          if (e.key === "Enter") handleNameSubmit();
                          if (e.key === "Escape") setShowProfilePopover(false);
                        }}
                        autoFocus
                        placeholder="Enter your name..."
                        maxLength={30}
                      />
                    </div>

                    <div className="profile-popover__title">Your Presence Color</div>
                    <div className="profile-popover__colors-grid">
                      {CURSOR_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`profile-popover__color-swatch ${profileColor === c ? "profile-popover__color-swatch--active" : ""}`}
                          style={{ backgroundColor: c }}
                          onClick={() => handleColorChange(c)}
                          title={`Select color ${c}`}
                        />
                      ))}
                    </div>

                    <div className="profile-popover__hint" style={{ marginTop: '16px' }}>
                      Profile changes sync in real-time
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
        onClear={() => {
          if (strokes.length > 0) setShowClearConfirm(true);
        }}
      />

      {showClearConfirm && (
        <div className="export-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setShowClearConfirm(false)}>
          <div className="export-modal" style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', width: '320px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', fontFamily: 'sans-serif' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Clear Board</h2>
            <p style={{ fontSize: '14px', marginBottom: '24px', color: '#475569', lineHeight: 1.5 }}>Are you sure you want to clear the entire board? You can undo this action.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowClearConfirm(false)} style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleClear} style={{ padding: '8px 16px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Clear Board</button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div className="export-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setShowPasswordPrompt(false)}>
          <div className="export-modal" style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', width: '320px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', fontFamily: 'sans-serif' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Board Protected</h2>
            <p style={{ fontSize: '14px', marginBottom: '24px', color: '#475569', lineHeight: 1.5 }}>This board requires a password to join.</p>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                placeholder="Enter password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => navigate('/')} style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Back to Home</button>
                <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Join Board</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Settings Modal */}
      {showPasswordModal && (
        <div className="export-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setShowPasswordModal(false)}>
          <div className="export-modal" style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', width: '320px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', fontFamily: 'sans-serif' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Board Privacy</h2>
            <p style={{ fontSize: '14px', marginBottom: '24px', color: '#475569', lineHeight: 1.5 }}>Set a password to protect this board or leave empty to make it public.</p>
            <form onSubmit={handleSetPassword}>
              <input
                type="password"
                placeholder="Enter password (leave empty for public)..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowPasswordModal(false)} style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Set Password</button>
              </div>
            </form>
            {boardPassword && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                <button onClick={handleRemovePassword} style={{ padding: '8px 16px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, width: '100%' }}>Remove Password</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
