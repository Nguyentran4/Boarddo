import { useCallback } from "react";
import type { ToolType } from "./Whiteboard";

interface ToolbarProps {
  color: string;
  onColorChange: (color: string) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  tool: ToolType;
  onToolChange: (tool: ToolType) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const COLORS = [
  "#e8e6f0", // White
  "#6c63ff", // Purple (accent)
  "#ff6b9d", // Pink
  "#4ade80", // Green
  "#38bdf8", // Blue
  "#facc15", // Yellow
  "#fb923c", // Orange
  "#f87171", // Red
];

export default function Toolbar({
  color,
  onColorChange,
  brushSize,
  onBrushSizeChange,
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: ToolbarProps) {
  const handleSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onBrushSizeChange(Number(e.target.value));
    },
    [onBrushSizeChange]
  );

  return (
    <div className="toolbar" id="toolbar">
      {/* Drawing Tools Group */}
      <div className="toolbar__group">
        {/* Pen Tool */}
        <button
          className={`toolbar__btn ${tool === "pen" ? "toolbar__btn--active" : ""}`}
          onClick={() => onToolChange("pen")}
          id="btn-pen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" />
          </svg>
          <span className="toolbar__btn-tooltip">Pen (P)</span>
        </button>

        {/* Eraser Tool */}
        <button
          className={`toolbar__btn ${tool === "eraser" ? "toolbar__btn--active" : ""}`}
          onClick={() => onToolChange("eraser")}
          id="btn-eraser"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0L21 5.2c.8.8.8 2 0 2.8L9.4 19.6" />
            <path d="M6 11l4 4" />
          </svg>
          <span className="toolbar__btn-tooltip">Eraser (E)</span>
        </button>

        <div className="toolbar__divider" />

        {/* Rectangle Tool */}
        <button
          className={`toolbar__btn ${tool === "rect" ? "toolbar__btn--active" : ""}`}
          onClick={() => onToolChange("rect")}
          id="btn-rect"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
          <span className="toolbar__btn-tooltip">Rectangle (R)</span>
        </button>

        {/* Circle Tool */}
        <button
          className={`toolbar__btn ${tool === "circle" ? "toolbar__btn--active" : ""}`}
          onClick={() => onToolChange("circle")}
          id="btn-circle"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
          </svg>
          <span className="toolbar__btn-tooltip">Circle (C)</span>
        </button>

        {/* Text Tool */}
        <button
          className={`toolbar__btn ${tool === "text" ? "toolbar__btn--active" : ""}`}
          onClick={() => onToolChange("text")}
          id="btn-text"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
          <span className="toolbar__btn-tooltip">Text (T)</span>
        </button>
      </div>

      <div className="toolbar__divider" />

      {/* Color Picker */}
      <div className="color-picker" id="color-picker">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`color-picker__swatch ${color === c ? "color-picker__swatch--active" : ""}`}
            style={{ backgroundColor: c }}
            onClick={() => {
              onColorChange(c);
              if (tool === "eraser") onToolChange("pen");
            }}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>

      <div className="toolbar__divider" />

      {/* Brush Size */}
      <div className="brush-size" id="brush-size">
        <div className="brush-size__preview">
          <div
            className="brush-size__dot"
            style={{
              width: Math.max(4, Math.min(brushSize, 20)),
              height: Math.max(4, Math.min(brushSize, 20)),
              backgroundColor: tool === "eraser" ? "var(--accent-secondary)" : color,
            }}
          />
        </div>
        <input
          type="range"
          className="brush-size__slider"
          min="1"
          max="32"
          value={brushSize}
          onChange={handleSizeChange}
          id="brush-size-slider"
        />
        <span className="brush-size__label">{brushSize}</span>
      </div>

      <div className="toolbar__divider" />

      {/* Undo */}
      <button
        className="toolbar__btn"
        onClick={onUndo}
        disabled={!canUndo}
        style={{ opacity: canUndo ? 1 : 0.3 }}
        id="btn-undo"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
        <span className="toolbar__btn-tooltip">Undo (Ctrl+Z)</span>
      </button>

      {/* Redo */}
      <button
        className="toolbar__btn"
        onClick={onRedo}
        disabled={!canRedo}
        style={{ opacity: canRedo ? 1 : 0.3 }}
        id="btn-redo"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
        </svg>
        <span className="toolbar__btn-tooltip">Redo (Ctrl+Y)</span>
      </button>

      <div className="toolbar__divider" />

      {/* Clear */}
      <button
        className="toolbar__btn toolbar__btn--danger"
        onClick={onClear}
        id="btn-clear"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        <span className="toolbar__btn-tooltip">Clear All</span>
      </button>
    </div>
  );
}
