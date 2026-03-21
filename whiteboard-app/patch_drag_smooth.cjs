const fs = require('fs');
const path = require('path');

const file = path.join('src', 'components', 'Whiteboard.tsx');
let source = fs.readFileSync(file, 'utf-8');

// 1. Add dragTempStrokes
const refStateOld = `  const isDraggingSelection = useRef(false);`;
const refStateNew = `  const dragTempStrokes = useRef<Stroke[] | null>(null);
  const isDraggingSelection = useRef(false);`;
source = source.replace(refStateOld, refStateNew);

// 2. Add ID to selected bounds DIV
source = source.replace(
/className="selected-bounds"/g,
'id={`bounds-${id}`} className="selected-bounds"'
);

// 3. Update move/resize logic in handlePointerMove
const moveTarget = /if \(tool === "select"\) \{\s*if \(isDraggingSelection\.current && dragSelectionStart\.current\) \{[\s\S]*?onStrokesChange\(newStrokes\);\s*\} else if \(isResizingSelection\.current && dragSelectionStart\.current && dragSelectionBounds\.current\) \{[\s\S]*?onStrokesChange\(newStrokes\);\s*\} else if \(isCreatingSelectionBox/g;

const match = source.match(moveTarget);
if (match) {
    const replacement = `if (tool === "select") {
        if (isDraggingSelection.current && dragSelectionStart.current) {
           const dx = point.x - dragSelectionStart.current.x;
           const dy = point.y - dragSelectionStart.current.y;
           
           const movedStrokes = dragOriginalStrokes.current.map(orig => {
               const newPoints = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
               return { ...orig, points: newPoints };
           });
           
           const newStrokes = strokes.map(s => {
               const moved = movedStrokes.find(m => m.id === s.id);
               return m ? m : s;
           });
           
           const canvas = canvasRef.current;
           if (canvas) {
             const liveStrokeArray = Array.from(liveStrokes.values());
             cancelAnimationFrame(animFrameId.current);
             animFrameId.current = requestAnimationFrame(() => {
                 redrawAll(canvas, newStrokes, liveStrokeArray);
                 movedStrokes.forEach(s => {
                     const el = document.getElementById(\`note-\${s.id}\`);
                     if (el && s.points[0]) {
                        el.style.left = s.points[0].x + 'px';
                        el.style.top = s.points[0].y + 'px';
                     }
                     const boundEl = document.getElementById(\`bounds-\${s.id}\`);
                     if (boundEl) {
                        const b = getStrokeBounds(s);
                        boundEl.style.left = (b.minX - 5) + 'px';
                        boundEl.style.top = (b.minY - 5) + 'px';
                        boundEl.style.width = (b.maxX - b.minX + 10) + 'px';
                        boundEl.style.height = (b.maxY - b.minY + 10) + 'px';
                     }
                 });
             });
           }
           dragTempStrokes.current = newStrokes;
           
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
               return m ? m : s;
           });
           
           const canvas = canvasRef.current;
           if (canvas) {
             const liveStrokeArray = Array.from(liveStrokes.values());
             cancelAnimationFrame(animFrameId.current);
             animFrameId.current = requestAnimationFrame(() => {
                 redrawAll(canvas, newStrokes, liveStrokeArray);
                 movedStrokes.forEach(s => {
                     const el = document.getElementById(\`note-\${s.id}\`);
                     if (el && s.points[0]) {
                        el.style.left = s.points[0].x + 'px';
                        el.style.top = s.points[0].y + 'px';
                        if (el.classList.contains('text-note')) {
                           el.style.fontSize = Math.max(14, s.width * 4) + 'px';
                        }
                     }
                     const boundEl = document.getElementById(\`bounds-\${s.id}\`);
                     if (boundEl) {
                        const b = getStrokeBounds(s);
                        boundEl.style.left = (b.minX - 5) + 'px';
                        boundEl.style.top = (b.minY - 5) + 'px';
                        boundEl.style.width = (b.maxX - b.minX + 10) + 'px';
                        boundEl.style.height = (b.maxY - b.minY + 10) + 'px';
                     }
                 });
             });
           }
           dragTempStrokes.current = newStrokes;
           
        } else if (isCreatingSelectionBox`;
    source = source.replace(moveTarget, replacement);
}

// 4. Update pointer up to commit dragTempStrokes
const upTarget = /if \(isResizingSelection\.current\) \{[\s\S]*?onStrokeComplete\?\.\(s\);\s*\}\s*\} else if \(isDraggingSelection\.current\) \{[\s\S]*?onStrokeComplete\?\.\(s\);\s*\}\s*\}/;
const upReplacement = `if (isResizingSelection.current || isDraggingSelection.current) {
            isResizingSelection.current = false;
            isDraggingSelection.current = false;
            resizeHandle.current = null;
            dragSelectionStart.current = null;
            dragSelectionBounds.current = null;
            
            if (dragTempStrokes.current) {
                onStrokesChange(dragTempStrokes.current);
                const selectedStrokes = dragTempStrokes.current.filter(s => selectedIds.has(s.id));
                for (const s of selectedStrokes) {
                   onStrokeUpdate?.(s);
                   onStrokeComplete?.(s);
                }
                dragTempStrokes.current = null;
            }
         }`;
source = source.replace(upTarget, upReplacement);

fs.writeFileSync(file, source);
console.log("Done adding drag optimization patch.");
