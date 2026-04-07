import { useCallback, useState, useRef, useEffect } from "react";
import type { ToolType } from "./Whiteboard";

interface ToolbarProps {
  color: string;
  onColorChange: (color: string) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  tool: ToolType;
  onToolChange: (tool: ToolType) => void;
  fillStyle: "outline" | "solid" | "semi";
  onFillStyleChange: (style: "outline" | "solid" | "semi") => void;
  strokeStyle: "solid" | "dashed" | "dotted";
  onStrokeStyleChange: (style: "solid" | "dashed" | "dotted") => void;
  backgroundType: "none" | "grid" | "dots";
  onBackgroundTypeChange: (type: "none" | "grid" | "dots") => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const COLORS = [
  "#000000", "#ffffff", "#e8e6f0", "#a0a0b0",
  "#f87171", "#ef4444", "#dc2626", "#991b1b",
  "#fb923c", "#f97316", "#facc15", "#eab308",
  "#4ade80", "#22c55e", "#16a34a", "#15803d",
  "#38bdf8", "#0ea5e9", "#3b82f6", "#2563eb",
  "#a78bfa", "#8b5cf6", "#6c63ff", "#ff6b9d",
];

export default function Toolbar({
  color,
  onColorChange,
  brushSize,
  onBrushSizeChange,
  tool,
  onToolChange,
  fillStyle,
  onFillStyleChange,
  strokeStyle,
  onStrokeStyleChange,
  backgroundType,
  onBackgroundTypeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: ToolbarProps) {
  const [showColorBoard, setShowColorBoard] = useState(false);
  const [showToolSettings, setShowToolSettings] = useState(false);
  const [hexInput, setHexInput] = useState(color);
  const colorBoardRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const [lastShape, setLastShape] = useState<ToolType>("rect");

  const handleSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onBrushSizeChange(Number(e.target.value));
    },
    [onBrushSizeChange]
  );

  useEffect(() => { setHexInput(color); }, [color]);

  // Show tool settings when pen/eraser/shape is selected
  useEffect(() => {
    const toolsWithSettings: ToolType[] = ["pen", "eraser", "rect", "circle", "line", "arrow", "triangle", "diamond", "star", "hexagon", "ellipse"];
    setShowToolSettings(toolsWithSettings.includes(tool));
  }, [tool]);

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

  // Close shape menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(e.target as Node)) {
        setShowShapeMenu(false);
      }
    }
    if (showShapeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showShapeMenu]);

  const handleHexSubmit = useCallback(() => {
    const hex = hexInput.trim();
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

  const isShapeTool = tool === "rect" || tool === "circle" || tool === "line" || tool === "arrow" || tool === "triangle" || tool === "diamond" || tool === "star" || tool === "hexagon" || tool === "ellipse";

  return (
    <>
      {/* ===== Left Vertical Toolbar ===== */}
      <div className="sidebar-toolbar" id="toolbar">
        {/* Selection & Pan */}
        <div className="sidebar-toolbar__group">
          <button
            className={`sidebar-toolbar__btn ${tool === "select" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange("select")}
            id="btn-select"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
              <path d="M13 13l6 6" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Select · V</span>
          </button>
        </div>

        <div className="sidebar-toolbar__divider" />

        {/* Drawing Tools */}
        <div className="sidebar-toolbar__group">
          <button
            className={`sidebar-toolbar__btn ${tool === "pen" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange("pen")}
            id="btn-pen"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Pen · P</span>
          </button>

          <button
            className={`sidebar-toolbar__btn ${tool === "eraser" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange("eraser")}
            id="btn-eraser"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0L21 5.2c.8.8.8 2 0 2.8L9.4 19.6" />
              <path d="M6 11l4 4" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Eraser · E</span>
          </button>

          <button
            className={`sidebar-toolbar__btn ${tool === "bucket" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange("bucket")}
            id="btn-bucket"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
              <path d="m5 2 5 5" />
              <path d="M2 13h15" />
              <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Fill Bucket · F</span>
          </button>
        </div>

        <div className="sidebar-toolbar__divider" />

        {/* Shapes */}
        <div className="sidebar-toolbar__group">
          <button
            className={`sidebar-toolbar__btn ${isShapeTool ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange(lastShape)}
            id="btn-shapes"
          >
            {/* Show icon of the current/last shape */}
            {(isShapeTool ? tool : lastShape) === "rect" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
            )}
            {(isShapeTool ? tool : lastShape) === "circle" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>
            )}
            {(isShapeTool ? tool : lastShape) === "triangle" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L22 21H2L12 3Z" /></svg>
            )}
            {(isShapeTool ? tool : lastShape) === "line" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>
            )}
            {(isShapeTool ? tool : lastShape) === "arrow" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5" /><polyline points="10 5 19 5 19 14" /></svg>
            )}
            {(isShapeTool ? tool : lastShape) === "diamond" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L22 12 12 22 2 12Z" /></svg>
            )}
            {(isShapeTool ? tool : lastShape) === "star" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            )}
            {(isShapeTool ? tool : lastShape) === "hexagon" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z" /></svg>
            )}
            {(isShapeTool ? tool : lastShape) === "ellipse" && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="10" ry="6" /></svg>
            )}
            <span className="sidebar-toolbar__tooltip">Shapes</span>
          </button>
        </div>

        <div className="sidebar-toolbar__divider" />

        {/* Text & Sticky */}
        <div className="sidebar-toolbar__group">
          <button
            className={`sidebar-toolbar__btn ${tool === "text" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange("text")}
            id="btn-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Text · T</span>
          </button>

          <button
            className={`sidebar-toolbar__btn ${tool === "sticky" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange("sticky")}
            id="btn-sticky"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
              <polyline points="14 3 14 8 21 8" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Sticky Note · S</span>
          </button>
        </div>

        <div className="sidebar-toolbar__divider" />

        {/* Color & Grid */}
        <div className="sidebar-toolbar__group" ref={colorBoardRef}>
          <button
            className={`sidebar-toolbar__btn ${tool === "eyedropper" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange("eyedropper")}
            id="btn-eyedropper"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 22 1-1h3l9-9" />
              <path d="M3 21v-3l9-9" />
              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Eyedropper · I</span>
          </button>

          <button
            className="sidebar-toolbar__btn color-picker-trigger"
            onClick={() => setShowColorBoard(!showColorBoard)}
            id="btn-color-picker"
          >
            <div className="color-picker-trigger__swatch" style={{ backgroundColor: color }} />
            <span className="sidebar-toolbar__tooltip">Colors</span>
          </button>

          {/* Color board flyout */}
          {showColorBoard && (
            <div className="color-board color-board--side" id="color-board">
              <div className="color-board__grid">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`color-board__swatch ${color === c ? "color-board__swatch--active" : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => handleColorSelect(c)}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <div className="color-board__divider" />
              <div className="color-board__hex">
                <label className="color-board__hex-label">HEX</label>
                <div className="color-board__hex-row">
                  <div className="color-board__hex-preview" style={{ backgroundColor: hexInput.startsWith("#") ? hexInput : `#${hexInput}` }} />
                  <input
                    type="text"
                    className="color-board__hex-input"
                    value={hexInput}
                    onChange={(e) => setHexInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleHexSubmit(); e.stopPropagation(); }}
                    onBlur={handleHexSubmit}
                    placeholder="#ff6b9d"
                    maxLength={7}
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="color-board__native">
                <input
                  type="color"
                  className="color-board__native-input"
                  value={color}
                  onChange={(e) => { handleColorSelect(e.target.value); setHexInput(e.target.value); }}
                  id="native-color-picker"
                />
                <label htmlFor="native-color-picker" className="color-board__native-label">Pick any color</label>
              </div>
            </div>
          )}

          <button
            className={`sidebar-toolbar__btn ${backgroundType !== "none" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onBackgroundTypeChange(backgroundType === "none" ? "grid" : backgroundType === "grid" ? "dots" : "none")}
            title="Toggle Background Pattern"
            id="btn-bg-toggle"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Grid</span>
          </button>
        </div>
      </div>

      {/* ===== Floating Tool Settings Panel ===== */}
      {showToolSettings && (
        <div className="tool-settings" ref={settingsPanelRef}>
          <div className="tool-settings__header">
            <span className="tool-settings__title">
              {tool === "pen" ? "Pen" : tool === "eraser" ? "Eraser" : isShapeTool ? "Shape" : ""}
            </span>
          </div>

          {isShapeTool && (
            <div className="tool-settings__shape-grid">
              {/* Basic */}
              <span className="tool-settings__shape-section">Basic</span>
              <div className="tool-settings__shape-row">
                {[
                  { id: "rect" as ToolType, title: "Rectangle", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg> },
                  { id: "circle" as ToolType, title: "Circle", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg> },
                  { id: "ellipse" as ToolType, title: "Ellipse", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="10" ry="6" /></svg> },
                  { id: "triangle" as ToolType, title: "Triangle", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L22 21H2L12 3Z" /></svg> },
                ].map((s) => (
                  <button key={s.id} className={`tool-settings__shape-btn ${tool === s.id ? "tool-settings__shape-btn--active" : ""}`} onClick={() => { onToolChange(s.id); setLastShape(s.id); }} title={s.title}>
                    {s.icon}
                  </button>
                ))}
              </div>

              {/* Lines & Arrows */}
              <span className="tool-settings__shape-section">Lines</span>
              <div className="tool-settings__shape-row">
                {[
                  { id: "line" as ToolType, title: "Line", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5" /></svg> },
                  { id: "arrow" as ToolType, title: "Arrow", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5" /><polyline points="10 5 19 5 19 14" /></svg> },
                ].map((s) => (
                  <button key={s.id} className={`tool-settings__shape-btn ${tool === s.id ? "tool-settings__shape-btn--active" : ""}`} onClick={() => { onToolChange(s.id); setLastShape(s.id); }} title={s.title}>
                    {s.icon}
                  </button>
                ))}
              </div>

              {/* Advanced */}
              <span className="tool-settings__shape-section">Advanced</span>
              <div className="tool-settings__shape-row">
                {[
                  { id: "diamond" as ToolType, title: "Diamond", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L22 12 12 22 2 12Z" /></svg> },
                  { id: "star" as ToolType, title: "Star", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg> },
                  { id: "hexagon" as ToolType, title: "Hexagon", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z" /></svg> },
                ].map((s) => (
                  <button key={s.id} className={`tool-settings__shape-btn ${tool === s.id ? "tool-settings__shape-btn--active" : ""}`} onClick={() => { onToolChange(s.id); setLastShape(s.id); }} title={s.title}>
                    {s.icon}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isShapeTool && (
            <div className="tool-settings__row">
              <label className="tool-settings__label">Fill</label>
              <div className="tool-settings__control">
                <select 
                  style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', background: 'transparent', outline: 'none', color: '#1e293b', fontSize: '12px', cursor: 'pointer' }}
                  value={fillStyle} 
                  onChange={(e) => onFillStyleChange(e.target.value as "outline" | "solid" | "semi")}
                >
                  <option value="outline">Outline Only</option>
                  <option value="solid">Solid Fill</option>
                  <option value="semi">Semi-transparent</option>
                </select>
              </div>
            </div>
          )}

          {isShapeTool && (
            <div className="tool-settings__row">
              <label className="tool-settings__label">Stroke</label>
              <div className="tool-settings__control">
                <select 
                  style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', background: 'transparent', outline: 'none', color: '#1e293b', fontSize: '12px', cursor: 'pointer' }}
                  value={strokeStyle} 
                  onChange={(e) => onStrokeStyleChange(e.target.value as "solid" | "dashed" | "dotted")}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
            </div>
          )}

          {/* Size */}
          <div className="tool-settings__row">
            <label className="tool-settings__label">Size</label>
            <div className="tool-settings__control">
              <input
                type="range"
                className="tool-settings__slider"
                min="1"
                max="32"
                value={brushSize}
                onChange={handleSizeChange}
              />
              <span className="tool-settings__value">{brushSize}px</span>
            </div>
          </div>

          {/* Color - for pen & shapes */}
          {tool !== "eraser" && (
            <div className="tool-settings__row">
              <label className="tool-settings__label">Color</label>
              <div className="tool-settings__colors">
                {COLORS.slice(0, 8).map((c) => (
                  <button
                    key={c}
                    className={`tool-settings__color-dot ${color === c ? "tool-settings__color-dot--active" : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => handleColorSelect(c)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Bottom Action Bar ===== */}
      <div className="bottom-actions" id="bottom-actions">
        <button className="bottom-actions__btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button className="bottom-actions__btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
        </button>

        <div className="bottom-actions__divider" />

        <button className="bottom-actions__btn bottom-actions__btn--danger" onClick={onClear} title="Clear Canvas">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </>
  );
}
