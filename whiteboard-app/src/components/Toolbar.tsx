import { useCallback } from "react";

interface ToolbarProps {
  color: string;
  onColorChange: (color: string) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  tool: "pen" | "eraser";
  onToolChange: (tool: "pen" | "eraser") => void;
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
      {/* Pen Tool */}
      <button
        className={`toolbar__btn ${tool === "pen" ? "toolbar__btn--active" : ""}`}
        onClick={() => onToolChange("pen")}
        id="btn-pen"
      >
        ✏️
        <span className="toolbar__btn-tooltip">Pen (P)</span>
      </button>

      {/* Eraser Tool */}
      <button
        className={`toolbar__btn ${tool === "eraser" ? "toolbar__btn--active" : ""}`}
        onClick={() => onToolChange("eraser")}
        id="btn-eraser"
      >
        🧹
        <span className="toolbar__btn-tooltip">Eraser (E)</span>
      </button>

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
              onToolChange("pen"); // Switch back to pen when picking a color
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
        ↩️
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
        ↪️
        <span className="toolbar__btn-tooltip">Redo (Ctrl+Y)</span>
      </button>

      <div className="toolbar__divider" />

      {/* Clear */}
      <button
        className="toolbar__btn toolbar__btn--danger"
        onClick={onClear}
        id="btn-clear"
      >
        🗑️
        <span className="toolbar__btn-tooltip">Clear All</span>
      </button>
    </div>
  );
}
