const fs = require('fs');
const path = require('path');

const file = path.join('src', 'components', 'Whiteboard.tsx');
let source = fs.readFileSync(file, 'utf-8');

// 1. Add resize state variables
const selectionState = `  const isDraggingSelection = useRef(false);`;
const resizeState = `  const isDraggingSelection = useRef(false);
  const isResizingSelection = useRef(false);
  const resizeHandle = useRef<string | null>(null);
  const dragSelectionBounds = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);`;
source = source.replace(selectionState, resizeState);

// 2. Add handle function to start resizing
const addResizeDivs = `
               <div className="resize-handle nw" style={handleStyle('nw')} onPointerDown={(e) => startResize(e, 'nw', id)} />
               <div className="resize-handle ne" style={handleStyle('ne')} onPointerDown={(e) => startResize(e, 'ne', id)} />
               <div className="resize-handle sw" style={handleStyle('sw')} onPointerDown={(e) => startResize(e, 'sw', id)} />
               <div className="resize-handle se" style={handleStyle('se')} onPointerDown={(e) => startResize(e, 'se', id)} />
`;
source = source.replace(
/ *<div className="resize-handle nw".*?\/>\s*<div className="resize-handle ne".*?\/>\s*<div className="resize-handle sw".*?\/>\s*<div className="resize-handle se".*?\/>/m,
addResizeDivs
);

// 3. pointerEvents: 'auto' in handleStyle
const oldHandleStyle = `const handleStyle = (pos: string): React.CSSProperties => {
     const style: React.CSSProperties = {
        position: 'absolute',
        width: 8, height: 8,
        backgroundColor: '#fff',
        border: '1px solid #3b82f6',
        borderRadius: '50%',
     };`;
const newHandleStyle = `const handleStyle = (pos: string): React.CSSProperties => {
     const style: React.CSSProperties = {
        position: 'absolute',
        width: 10, height: 10,
        backgroundColor: '#fff',
        border: '1px solid #3b82f6',
        borderRadius: '50%',
        pointerEvents: 'auto',
     };`;
source = source.replace(oldHandleStyle, newHandleStyle);

// 4. Implement startResize and resize logic
const helperFuncs = `  const startResize = (e: React.PointerEvent, pos: string, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    isResizingSelection.current = true;
    resizeHandle.current = pos;
    const canvas = canvasRef.current;
    if (canvas) {
       const rect = canvas.getBoundingClientRect();
       dragSelectionStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    
    // Select only this object if not selected
    if (!selectedIds.has(id)) {
       setSelectedIds(new Set([id]));
       dragOriginalStrokes.current = [strokes.find(s => s.id === id)!];
    } else {
       dragOriginalStrokes.current = strokes.filter(s => selectedIds.has(s.id));
    }
    
    // Compute combined bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    dragOriginalStrokes.current.forEach(s => {
       const b = getStrokeBounds(s);
       if (b.minX < minX) minX = b.minX;
       if (b.minY < minY) minY = b.minY;
       if (b.maxX > maxX) maxX = b.maxX;
       if (b.maxY > maxY) maxY = b.maxY;
    });
    dragSelectionBounds.current = { minX, minY, maxX, maxY };
    
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const getCursorStyle = () => {`;
source = source.replace(`  const getCursorStyle = () => {`, helperFuncs);

// Modify handlePointerMove
const moveLogic = `           onStrokesChange(newStrokes);
        } else if (isCreatingSelectionBox`;
const resizeLogicMove = `           onStrokesChange(newStrokes);
        } else if (isResizingSelection.current && dragSelectionStart.current && dragSelectionBounds.current) {
           const dx = point.x - dragSelectionStart.current.x;
           const dy = point.y - dragSelectionStart.current.y;
           const b = dragSelectionBounds.current;
           const w = b.maxX - b.minX;
           const h = b.maxY - b.minY;
           if (w === 0 || h === 0) return;
           
           let scaleX = 1;
           let scaleY = 1;
           let originX = b.minX;
           let originY = b.minY;
           
           if (resizeHandle.current === 'se') {
              scaleX = (w + dx) / w; scaleY = (h + dy) / h;
              originX = b.minX; originY = b.minY;
           } else if (resizeHandle.current === 'nw') {
              scaleX = (w - dx) / w; scaleY = (h - dy) / h;
              originX = b.maxX; originY = b.maxY;
           } else if (resizeHandle.current === 'ne') {
              scaleX = (w + dx) / w; scaleY = (h - dy) / h;
              originX = b.minX; originY = b.maxY;
           } else if (resizeHandle.current === 'sw') {
              scaleX = (w - dx) / w; scaleY = (h + dy) / h;
              originX = b.maxX; originY = b.minY;
           }
           
           if (scaleX === 0) scaleX = 0.01;
           if (scaleY === 0) scaleY = 0.01;
           
           const movedStrokes = dragOriginalStrokes.current.map(orig => {
               const newPoints = orig.points.map(p => ({
                   x: originX + (p.x - originX) * scaleX,
                   y: originY + (p.y - originY) * scaleY
               }));
               return { ...orig, points: newPoints, width: orig.width * Math.max(scaleX, scaleY) };
           });
           
           const newStrokes = strokes.map(s => {
               const moved = movedStrokes.find(m => m.id === s.id);
               return moved ? moved : s;
           });
           
           onStrokesChange(newStrokes);
        } else if (isCreatingSelectionBox`;
source = source.replace(moveLogic, resizeLogicMove);

// Modify handlePointerUp
const upLogicTarget = `      if (tool === "select") {
         canvasRef.current?.releasePointerCapture(e.pointerId);
         if (isDraggingSelection.current) {`;
const upLogicReplacement = `      if (tool === "select") {
         canvasRef.current?.releasePointerCapture(e.pointerId);
         if (isResizingSelection.current) {
            isResizingSelection.current = false;
            resizeHandle.current = null;
            dragSelectionStart.current = null;
            dragSelectionBounds.current = null;
            const selectedStrokes = strokes.filter(s => selectedIds.has(s.id));
            for (const s of selectedStrokes) {
               onStrokeUpdate?.(s);
               onStrokeComplete?.(s);
            }
         } else if (isDraggingSelection.current) {`;
source = source.replace(upLogicTarget, upLogicReplacement);

// Fix pad in bounds calculation
source = source.replace('const pad = stroke.width / 2;', 'const pad = Math.max(stroke.width, 10);');

fs.writeFileSync(file, source);
console.log("Done adding resize patch.");
