import { useCallback, useState, useRef, useEffect } from "react";
import type { ToolType } from "./BoarddoCanvas";

interface ToolbarProps {
  color: string;
  onColorChange: (color: string) => void;
  stickyColor: string;
  onStickyColorChange: (color: string) => void;
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
  recentColorsStorageKey?: string;
}

const COLORS = [
  "#000000", "#ffffff", "#e8e6f0", "#a0a0b0",
  "#f87171", "#ef4444", "#dc2626", "#991b1b",
  "#fb923c", "#f97316", "#facc15", "#eab308",
  "#4ade80", "#22c55e", "#16a34a", "#15803d",
  "#38bdf8", "#0ea5e9", "#3b82f6", "#2563eb",
  "#a78bfa", "#8b5cf6", "#6c63ff", "#ff6b9d",
];

const STICKY_COLORS = [
  "#fef08a", "#fde68a", "#fcd34d",
  "#fbcfe8", "#f9a8d4", "#f472b6",
  "#bbf7d0", "#86efac", "#4ade80",
  "#bfdbfe", "#93c5fd", "#60a5fa",
  "#e9d5ff", "#c4b5fd", "#a78bfa",
  "#fed7aa", "#fdba74", "#fb923c",
  "#fecaca", "#fca5a5", "#f87171",
  "#f3f4f6", "#e2e8f0", "#ffffff",
];

const DEFAULT_RECENT_COLORS_STORAGE_KEY = "boarddo_custom_colors";

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!match) return null;

  const hex = match[1];
  if (hex.length === 3) {
    return `#${hex.split("").map((char) => char + char).join("")}`.toLowerCase();
  }

  return `#${hex.slice(0, 6)}`.toLowerCase();
}

function colorsMatch(a: string, b: string): boolean {
  return normalizeHexColor(a) === normalizeHexColor(b);
}

function hexToRgb(value: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function colorsAreVisuallyClose(a: string, b: string): boolean {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return false;

  const distance = Math.hypot(rgbA.r - rgbB.r, rgbA.g - rgbB.g, rgbA.b - rgbB.b);
  return distance < 28;
}

function areColorListsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}

function sanitizeRecentColors(colors: unknown[]): string[] {
  const seen = new Set<string>();
  const recentColors: string[] = [];

  for (const color of colors) {
    if (typeof color !== "string") continue;
    const normalizedColor = normalizeHexColor(color);
    if (!normalizedColor) continue;
    if (COLORS.some((defaultColor) => colorsMatch(defaultColor, normalizedColor))) continue;
    if (seen.has(normalizedColor)) continue;
    if (recentColors.some((recentColor) => colorsAreVisuallyClose(recentColor, normalizedColor))) continue;

    seen.add(normalizedColor);
    recentColors.push(normalizedColor);
    if (recentColors.length >= 12) break;
  }

  return recentColors;
}

function loadRecentColors(storageKey: string): string[] {
  try {
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];

    return sanitizeRecentColors(parsed);
  } catch {
    return [];
  }
}

export default function Toolbar({
  color,
  onColorChange,
  stickyColor,
  onStickyColorChange,
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
  recentColorsStorageKey = DEFAULT_RECENT_COLORS_STORAGE_KEY,
}: ToolbarProps) {
  const [showColorBoard, setShowColorBoard] = useState(false);
  const [showToolSettings, setShowToolSettings] = useState(false);
  const [hexInput, setHexInput] = useState(color);
  const colorBoardRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const [lastShape, setLastShape] = useState<ToolType>("rect");

  // Custom colors state with persistence
  const [customColors, setCustomColors] = useState<string[]>(() => loadRecentColors(recentColorsStorageKey));

  useEffect(() => {
    setCustomColors(loadRecentColors(recentColorsStorageKey));
  }, [recentColorsStorageKey]);

  // Track color changes and add to custom list if not a default color
  useEffect(() => {
    const normalizedColor = normalizeHexColor(color);
    const cleanedCustoms = sanitizeRecentColors(customColors);

    if (!areColorListsEqual(cleanedCustoms, customColors)) {
      setCustomColors(cleanedCustoms);
      localStorage.setItem(recentColorsStorageKey, JSON.stringify(cleanedCustoms));
      return;
    }

    if (!normalizedColor) return;
    const isDefault = COLORS.some(c => colorsMatch(c, normalizedColor));

    if (isDefault) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCustomColors((previousCustomColors) => {
        const cleanedPrevious = sanitizeRecentColors(previousCustomColors);
        const newCustoms = [
          normalizedColor,
          ...cleanedPrevious.filter(c => !colorsAreVisuallyClose(c, normalizedColor))
        ].slice(0, 12);

        if (areColorListsEqual(newCustoms, previousCustomColors)) {
          return previousCustomColors;
        }

        localStorage.setItem(recentColorsStorageKey, JSON.stringify(newCustoms));
        return newCustoms;
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [color, customColors, recentColorsStorageKey]);

  const handleSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onBrushSizeChange(Number(e.target.value));
    },
    [onBrushSizeChange]
  );

  useEffect(() => { setHexInput(normalizeHexColor(color) ?? color); }, [color]);

  // Show tool settings when pen/eraser/shape/text/sticky is selected
  useEffect(() => {
    const toolsWithSettings: ToolType[] = ["pen", "eraser", "rect", "circle", "line", "arrow", "triangle", "diamond", "star", "hexagon", "ellipse", "text", "sticky"];
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
    const normalizedHex = normalizeHexColor(hexInput);
    if (normalizedHex) {
      onColorChange(normalizedHex);
      if (tool === "eraser") onToolChange("pen");
    }
  }, [hexInput, onColorChange, tool, onToolChange]);

  const handleColorSelect = useCallback(
    (c: string) => {
      onColorChange(normalizeHexColor(c) ?? c);
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

          <button
            className={`sidebar-toolbar__btn ${tool === "area-select" ? "sidebar-toolbar__btn--active" : ""}`}
            onClick={() => onToolChange("area-select")}
            id="btn-area-select"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="1" strokeDasharray="4 2" />
            </svg>
            <span className="sidebar-toolbar__tooltip">Area Select · A</span>
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
                    className={`color-board__swatch ${colorsMatch(color, c) ? "color-board__swatch--active" : ""}`}
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
                  <div className="color-board__hex-preview" style={{ backgroundColor: normalizeHexColor(hexInput) ?? "#000000" }} />
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
                  value={normalizeHexColor(color) ?? "#000000"}
                  onChange={(e) => { handleColorSelect(e.target.value); setHexInput(e.target.value); }}
                  id="native-color-picker"
                />
                <label htmlFor="native-color-picker" className="color-board__native-label">Pick any color</label>
              </div>

              {customColors.length > 0 && (
                <>
                  <div className="color-board__divider" />
                  <div className="color-board__hex-label" style={{ marginBottom: '8px' }}>Recent</div>
                  <div className="color-board__grid">
                    {customColors.map((c) => (
                      <button
                        key={c}
                        className={`color-board__swatch ${colorsMatch(color, c) ? "color-board__swatch--active" : ""}`}
                        style={{ backgroundColor: c }}
                        onClick={() => handleColorSelect(c)}
                        aria-label={`Recent color ${c}`}
                      />
                    ))}
                  </div>
                </>
              )}
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
              {tool === "pen" ? "Pen" : tool === "eraser" ? "Eraser" : tool === "sticky" ? "Sticky Note" : tool === "text" ? "Text" : isShapeTool ? "Shape" : ""}
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

          {/* Size - hide for sticky since it doesn't apply */}
          {tool !== "sticky" && (
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
          )}

          {/* Sticky Note Color Table */}
          {tool === "sticky" && (
            <div className="tool-settings__row">
              <label className="tool-settings__label">Note Color</label>
              <div className="sticky-color-table">
                {STICKY_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`sticky-color-table__swatch ${colorsMatch(stickyColor, c) ? "sticky-color-table__swatch--active" : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => onStickyColorChange(c)}
                    aria-label={`Sticky color ${c}`}
                  />
                ))}
              </div>
              <div className="sticky-color-table__native">
                <input
                  type="color"
                  className="color-board__native-input"
                  value={normalizeHexColor(stickyColor) ?? "#fef08a"}
                  onChange={(e) => onStickyColorChange(e.target.value)}
                  id="sticky-native-color-picker"
                />
                <label htmlFor="sticky-native-color-picker" className="color-board__native-label">Custom color</label>
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
