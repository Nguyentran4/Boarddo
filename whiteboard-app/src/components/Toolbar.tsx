import { useCallback, useState, useRef, useEffect } from "react";
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
  // Row 1: Neutrals & basics
  "#ffffff", "#e8e6f0", "#a0a0b0", "#6b6b80",
  // Row 2: Warm tones
  "#f87171", "#ef4444", "#dc2626", "#991b1b",
  // Row 3: Orange / Yellow
  "#fb923c", "#f97316", "#facc15", "#eab308",
  // Row 4: Greens
  "#4ade80", "#22c55e", "#16a34a", "#15803d",
  // Row 5: Blues / Cyans
  "#38bdf8", "#0ea5e9", "#3b82f6", "#2563eb",
  // Row 6: Purples / Pinks
  "#a78bfa", "#8b5cf6", "#6c63ff", "#ff6b9d",
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
  const [showColorBoard, setShowColorBoard] = useState(false);
  const [hexInput, setHexInput] = useState(color);
  const colorBoardRef = useRef<HTMLDivElement>(null);

  const handleSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onBrushSizeChange(Number(e.target.value));
    },
    [onBrushSizeChange]
  );

  // Sync hex input when color changes externally
  useEffect(() => {
    setHexInput(color);
  }, [color]);

  // Close color board on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colorBoardRef.current && !colorBoardRef.current.contains(e.target as Node)) {
        setShowColorBoard(false);
      }
    }
    if (showColorBoard) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showColorBoard]);

  const handleHexSubmit = useCallback(() => {
    const hex = hexInput.trim();
    // Validate hex color
    if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
      const normalizedHex = hex.startsWith("#") ? hex : `#${hex}`;
      onColorChange(normalizedHex);
      if (tool === "eraser") onToolChange("pen");
    }
  }, [hexInput, onColorChange, tool, onToolChange]);

  const handleColorSelect = useCallback(
    (c: string) => {
      onColorChange(c);
      if (tool === "eraser") onToolChange("pen");
    },
    [onColorChange, tool, onToolChange]
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

        {/* Sticky Note Tool */}
        <button
          className={`toolbar__btn ${tool === "sticky" ? "toolbar__btn--active" : ""}`}
          onClick={() => onToolChange("sticky")}
          id="btn-sticky"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
            <polyline points="14 3 14 8 21 8" />
          </svg>
          <span className="toolbar__btn-tooltip">Sticky Note (S)</span>
        </button>
      </div>

      <div className="toolbar__divider" />

      {/* Color picker trigger + flyout */}
      <div className="color-picker-wrapper" ref={colorBoardRef}>
        {/* Active color swatch (click to open board) */}
        <button
          className="toolbar__btn color-picker-trigger"
          onClick={() => setShowColorBoard(!showColorBoard)}
          id="btn-color-picker"
        >
          <div
            className="color-picker-trigger__swatch"
            style={{ backgroundColor: color }}
          />
          <span className="toolbar__btn-tooltip">Colors</span>
        </button>

        {/* Color board flyout */}
        {showColorBoard && (
          <div className="color-board" id="color-board">
            {/* Color grid */}
            <div className="color-board__grid">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-board__swatch ${color === c ? "color-board__swatch--active" : ""}`}
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    handleColorSelect(c);
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>

            <div className="color-board__divider" />

            {/* Hex color input */}
            <div className="color-board__hex">
              <label className="color-board__hex-label">HEX</label>
              <div className="color-board__hex-row">
                <div
                  className="color-board__hex-preview"
                  style={{ backgroundColor: hexInput.startsWith("#") ? hexInput : `#${hexInput}` }}
                />
                <input
                  type="text"
                  className="color-board__hex-input"
                  value={hexInput}
                  onChange={(e) => setHexInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleHexSubmit();
                    }
                    e.stopPropagation();
                  }}
                  onBlur={handleHexSubmit}
                  placeholder="#ff6b9d"
                  maxLength={7}
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Native color input for full color picker */}
            <div className="color-board__native">
              <input
                type="color"
                className="color-board__native-input"
                value={color}
                onChange={(e) => {
                  handleColorSelect(e.target.value);
                  setHexInput(e.target.value);
                }}
                id="native-color-picker"
              />
              <label htmlFor="native-color-picker" className="color-board__native-label">
                Pick any color
              </label>
            </div>
          </div>
        )}
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
