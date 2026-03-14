import { useState, useEffect, useCallback, useRef } from "react";
import Whiteboard from "./components/Whiteboard";
import type { Stroke } from "./components/Whiteboard";
import Toolbar from "./components/Toolbar";

function App() {
  const [color, setColor] = useState("#e8e6f0");
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);

  // Track stroke count for status display
  const strokeCountRef = useRef(0);
  strokeCountRef.current = strokes.length;

  // ===== Undo / Redo =====
  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => [...s, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleClear = useCallback(() => {
    if (strokes.length === 0) return;
    setRedoStack([]);
    setStrokes([]);
  }, [strokes]);

  // Clear redo stack when new strokes are drawn
  const handleStrokesChange = useCallback((newStrokes: Stroke[]) => {
    setStrokes(newStrokes);
    setRedoStack([]); // New drawing invalidates redo history
  }, []);

  // ===== Keyboard Shortcuts =====
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+Z / Cmd+Z → Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Y / Cmd+Shift+Z → Redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        handleRedo();
      }
      // P → Pen
      if (e.key === "p" && !e.ctrlKey && !e.metaKey) {
        setTool("pen");
      }
      // E → Eraser
      if (e.key === "e" && !e.ctrlKey && !e.metaKey) {
        setTool("eraser");
      }
      // [ → Decrease brush
      if (e.key === "[") {
        setBrushSize((s) => Math.max(1, s - 2));
      }
      // ] → Increase brush
      if (e.key === "]") {
        setBrushSize((s) => Math.min(32, s + 2));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  return (
    <div className="app">
      {/* Top Bar */}
      <header className="top-bar" id="top-bar">
        <div className="top-bar__logo">
          <div className="top-bar__logo-icon">🎨</div>
          <h1 className="top-bar__title">Whiteboard</h1>
        </div>
        <div className="top-bar__status">
          <div className="top-bar__status-dot" />
          <span>{strokes.length} stroke{strokes.length !== 1 ? "s" : ""}</span>
        </div>
      </header>

      {/* Canvas */}
      <Whiteboard
        color={color}
        brushSize={brushSize}
        tool={tool}
        strokes={strokes}
        onStrokesChange={handleStrokesChange}
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
          <span className="shortcut__key">P</span>
          <span>Pen</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">E</span>
          <span>Eraser</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">[ ]</span>
          <span>Brush size</span>
        </div>
        <div className="shortcut">
          <span className="shortcut__key">⌘Z</span>
          <span>Undo</span>
        </div>
      </div>
    </div>
  );
}

export default App;
