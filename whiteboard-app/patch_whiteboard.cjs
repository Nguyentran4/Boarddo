const fs = require('fs');
const path = require('path');

const file = path.join('src', 'components', 'Whiteboard.tsx');
let source = fs.readFileSync(file, 'utf-8');

// 1. ToolType
source = source.replace(
  'export type ToolType = "pen" | "eraser" | "rect" | "circle" | "text" | "sticky";',
  'export type ToolType = "select" | "pen" | "eraser" | "rect" | "circle" | "text" | "sticky";'
);

// 2. Add bounds functions near generateStrokeId
const boundsFunc = `
function getStrokeBounds(stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } {
  if (stroke.points.length === 0) return { minX:0, minY:0, maxX:0, maxY:0 };
  
  if (stroke.type === "text" || stroke.type === "sticky") {
    const el = document.getElementById(\`note-\${stroke.id}\`);
    if (el) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const p = stroke.points[0];
      return { minX: p.x, minY: p.y, maxX: p.x + w, maxY: p.y + h };
    }
    const w = stroke.type === "sticky" ? 200 : 100;
    const h = stroke.type === "sticky" ? 200 : 40;
    const p = stroke.points[0];
    return { minX: p.x, minY: p.y, maxX: p.x + w, maxY: p.y + h };
  }
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (stroke.type === "circle" && stroke.points.length >= 2) {
    const c = stroke.points[0];
    const e = stroke.points[1];
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    return { minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r };
  }
  
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  
  if (stroke.type === "pen" || stroke.type === "eraser" || stroke.type === "rect") {
     const pad = stroke.width / 2;
     minX -= pad;
     minY -= pad;
     maxX += pad;
     maxY += pad;
  }
  
  return { minX, minY, maxX, maxY };
}

function pointInBounds(p: Point, b: { minX: number; minY: number; maxX: number; maxY: number }, padding = 10) {
  return p.x >= b.minX - padding && p.x <= b.maxX + padding &&
         p.y >= b.minY - padding && p.y <= b.maxY + padding;
}

function boundsIntersect(b1: { minX: number; minY: number; maxX: number; maxY: number }, b2: { minX: number; minY: number; maxX: number; maxY: number }) {
  return !(b2.minX > b1.maxX || 
           b2.maxX < b1.minX || 
           b2.minY > b1.maxY ||
           b2.maxY < b1.minY);
}
`;
source = source.replace('// Generate unique IDs for strokes', boundsFunc + '\n// Generate unique IDs for strokes');

// 3. Selection state
const selectionState = `
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dragSelectionStart = useRef<Point | null>(null);
  const dragOriginalStrokes = useRef<Stroke[]>([]);
  const isDraggingSelection = useRef(false);
  const isCreatingSelectionBox = useRef(false);
  const [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);

  // Keyboard delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") {
          return;
        }
        e.preventDefault();
        const newStrokes = strokes.filter(s => !selectedIds.has(s.id));
        onStrokesChange(newStrokes);
        // Deselect
        setSelectedIds(new Set());
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [strokes, selectedIds, onStrokesChange]);

  // Clear selection on tool change
  useEffect(() => {
    if (tool !== "select") {
      setSelectedIds(new Set());
      setSelectionBox(null);
    }
  }, [tool]);
`;
source = source.replace('// ===== Canvas Sizing =====', selectionState + '\n  // ===== Canvas Sizing =====');

// 4. Note Object ID addition
source = source.replace(
  'className={`note-overlay sticky-note ${isDragging ? "note-overlay--dragging" : ""}`}',
  'id={`note-${note.id}`}\n              className={`note-overlay sticky-note ${isDragging ? "note-overlay--dragging" : ""} ${selectedIds.has(note.id) ? "note-overlay--selected" : ""}`}'
);
source = source.replace(
  'className={`note-overlay text-note ${isDragging ? "note-overlay--dragging" : ""}`}',
  'id={`note-${note.id}`}\n            className={`note-overlay text-note ${isDragging ? "note-overlay--dragging" : ""} ${selectedIds.has(note.id) ? "note-overlay--selected" : ""}`}'
);

// 5. In handlePointerDown
const pointerDownTarget = `      // Text tool: place input at click position`;
const pointerDownSelect = `
      // Selection tool: picking or box start
      if (tool === "select") {
        let hitId = null;
        for (let i = strokes.length - 1; i >= 0; i--) {
          const s = strokes[i];
          const b = getStrokeBounds(s);
          if (pointInBounds(point, b, 5)) {
            hitId = s.id;
            break;
          }
        }

        if (hitId) {
          let newSelected = new Set(selectedIds);
          if (!e.shiftKey) {
             if (!newSelected.has(hitId)) {
                newSelected = new Set([hitId]);
             }
          } else {
             if (newSelected.has(hitId)) {
                newSelected.delete(hitId);
             } else {
                newSelected.add(hitId);
             }
          }
          setSelectedIds(newSelected);

          isDraggingSelection.current = true;
          dragSelectionStart.current = point;
          dragOriginalStrokes.current = strokes.filter(s => newSelected.has(s.id));
        } else {
          if (!e.shiftKey) {
             setSelectedIds(new Set());
          }
          isCreatingSelectionBox.current = true;
          setSelectionBox({ start: point, end: point });
        }
        
        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }
`;
source = source.replace(pointerDownTarget, pointerDownSelect + pointerDownTarget);

// 6. In handlePointerMove
const pointerMoveTarget = `      if (!isDrawing.current || !currentStroke.current || !lastPoint.current) return;`;
const pointerMoveSelect = `
      if (tool === "select") {
        if (isDraggingSelection.current && dragSelectionStart.current) {
           const dx = point.x - dragSelectionStart.current.x;
           const dy = point.y - dragSelectionStart.current.y;
           
           const movedStrokes = dragOriginalStrokes.current.map(orig => {
               const newPoints = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
               return { ...orig, points: newPoints };
           });
           
           const newStrokes = strokes.map(s => {
               const moved = movedStrokes.find(m => m.id === s.id);
               return moved ? moved : s;
           });
           
           onStrokesChange(newStrokes);
        } else if (isCreatingSelectionBox.current && selectionBox) {
           setSelectionBox({ ...selectionBox, end: point });
        }
        return;
      }
`;
source = source.replace(pointerMoveTarget, pointerMoveSelect + pointerMoveTarget);

// 7. In handlePointerUp
const pointerUpTarget = `      if (!isDrawing.current || !currentStroke.current) return;`;
const pointerUpSelect = `
      if (tool === "select") {
         canvasRef.current?.releasePointerCapture(e.pointerId);
         if (isDraggingSelection.current) {
            isDraggingSelection.current = false;
            dragSelectionStart.current = null;
            const selectedStrokes = strokes.filter(s => selectedIds.has(s.id));
            for (const s of selectedStrokes) {
               onStrokeUpdate?.(s);
               onStrokeComplete?.(s);
            }
         } else if (isCreatingSelectionBox.current && selectionBox) {
            isCreatingSelectionBox.current = false;
            const boxBounds = {
               minX: Math.min(selectionBox.start.x, selectionBox.end.x),
               maxX: Math.max(selectionBox.start.x, selectionBox.end.x),
               minY: Math.min(selectionBox.start.y, selectionBox.end.y),
               maxY: Math.max(selectionBox.start.y, selectionBox.end.y)
            };
            
            const newlySelected = new Set(selectedIds);
            for (const s of strokes) {
               if (boundsIntersect(getStrokeBounds(s), boxBounds)) {
                   newlySelected.add(s.id);
               }
            }
            setSelectedIds(newlySelected);
            setSelectionBox(null);
         }
         return;
      }
`;
source = source.replace(pointerUpTarget, pointerUpSelect + pointerUpTarget);

// 8. Style updates for cursors & 9. Add selection box overlay at the end
const overlayContentTarget = `      {/* Remote user cursors */}`;
const newOverlayContent = `
      {/* Selection Box Overlay */}
      {selectionBox && (
        <div
          className="selection-box"
          style={{
            position: 'absolute',
            border: '1px solid #4ade80',
            backgroundColor: 'rgba(74, 222, 128, 0.1)',
            left: Math.min(selectionBox.start.x, selectionBox.end.x),
            top: Math.min(selectionBox.start.y, selectionBox.end.y),
            width: Math.abs(selectionBox.end.x - selectionBox.start.x),
            height: Math.abs(selectionBox.end.y - selectionBox.start.y),
            pointerEvents: 'none',
          }}
        />
      )}
      
      {/* Selected Items Bounds Overlays */}
      {tool === "select" && Array.from(selectedIds).map(id => {
         const s = strokes.find(st => st.id === id);
         if (!s) return null;
         const b = getStrokeBounds(s);
         return (
            <div
               key={\`bounds-\${id}\`}
               className="selected-bounds"
               style={{
                  position: 'absolute',
                  border: '1px dashed #3b82f6',
                  left: b.minX - 5,
                  top: b.minY - 5,
                  width: b.maxX - b.minX + 10,
                  height: b.maxY - b.minY + 10,
                  pointerEvents: 'none',
               }}
            >
               <div className="resize-handle nw" style={handleStyle('nw')} />
               <div className="resize-handle ne" style={handleStyle('ne')} />
               <div className="resize-handle sw" style={handleStyle('sw')} />
               <div className="resize-handle se" style={handleStyle('se')} />
            </div>
         );
      })}

      {/* Remote user cursors */}`;

const handleHelper = `
  const getCursorStyle = () => {
    switch (tool) {
      case "text":
      case "sticky": return "crosshair";
      case "rect":
      case "circle": return "crosshair";
      case "select": return "default";
      default: return "none";
    }
  };

  const handleStyle = (pos: string): React.CSSProperties => {
     const style: React.CSSProperties = {
        position: 'absolute',
        width: 8, height: 8,
        backgroundColor: '#fff',
        border: '1px solid #3b82f6',
        borderRadius: '50%',
     };
     if (pos === 'nw') { style.top = -4; style.left = -4; style.cursor = 'nwse-resize'; }
     if (pos === 'ne') { style.top = -4; style.right = -4; style.cursor = 'nesw-resize'; }
     if (pos === 'sw') { style.bottom = -4; style.left = -4; style.cursor = 'nesw-resize'; }
     if (pos === 'se') { style.bottom = -4; style.right = -4; style.cursor = 'nwse-resize'; }
     return style;
  };
`;

const getCursorStyleTarget = `  const getCursorStyle = () => {
    switch (tool) {
      case "text":
      case "sticky": return "crosshair";
      case "rect":
      case "circle": return "crosshair";
      default: return "none";
    }
  };`;

if (source.includes(getCursorStyleTarget)) {
    source = source.replace(getCursorStyleTarget, handleHelper);
} else {
    console.log("Could not find getCursorStyleTarget.");
}

if (source.includes(overlayContentTarget)) {
    source = source.replace(overlayContentTarget, newOverlayContent);
} else {
    console.log("Could not find overlayContentTarget.");
}

fs.writeFileSync(file, source);
console.log("Done patching Whiteboard.tsx.");
