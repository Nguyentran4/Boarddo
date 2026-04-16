import type { Stroke } from "../components/BoarddoCanvas";

export interface ExportOptions {
  filename: string;
  format: 'png' | 'jpeg' | 'svg';
  scale: number;
  transparent: boolean;
  selectionOnly: boolean;
}

export function exportBoard(
  strokes: Stroke[],
  options: ExportOptions,
  getBounds: (s: Stroke) => { minX: number; minY: number; maxX: number; maxY: number }
) {
  if (strokes.length === 0) {
    alert("Nothing to export!");
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach(s => {
    const b = getBounds(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  });

  if (minX === Infinity) return;

  const padding = 40;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;

  if (options.format === 'svg') {
    exportSVG(strokes, width, height, minX, minY, options.transparent, options.filename);
  } else {
    exportRaster(strokes, width, height, minX, minY, options);
  }
}

function getNoteDimensions(stroke: Stroke) {
  const el = document.getElementById(`note-${stroke.id}`);
  if (el) {
    return { w: el.offsetWidth, h: el.offsetHeight };
  }
  return { w: stroke.type === 'sticky' ? 200 : 100, h: stroke.type === 'sticky' ? 200 : 40 };
}

function exportSVG(strokes: Stroke[], width: number, height: number, minX: number, minY: number, transparent: boolean, filename: string) {
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`;
  
  if (!transparent) {
    svgContent += `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f5f5f5" />`;
  }

  strokes.forEach(stroke => {
    if (stroke.type === 'eraser' || stroke.points.length === 0) return; // Erased visually via composite normally, skip here for simplicity in basic SVG export, though true robust SVG needs masks.

    const color = stroke.color;
    const strokeWidth = stroke.width;

    if (stroke.type === 'pen') {
      let d = `M ${stroke.points[0].x} ${stroke.points[0].y}`;
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        d += ` Q ${stroke.points[i].x} ${stroke.points[i].y} ${midX} ${midY}`;
      }
      const last = stroke.points[stroke.points.length - 1];
      d += ` L ${last.x} ${last.y}`;
      svgContent += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
    } else if (stroke.type === 'rect') {
      const p1 = stroke.points[0];
      const p2 = stroke.points[1] || p1;
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);
      svgContent += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;
    } else if (stroke.type === 'circle') {
      const p1 = stroke.points[0];
      const p2 = stroke.points[1] || p1;
      const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      svgContent += `<circle cx="${p1.x}" cy="${p1.y}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />`;
    } else if (stroke.type === 'sticky') {
      const { w, h } = getNoteDimensions(stroke);
      const x = stroke.points[0].x;
      const y = stroke.points[0].y;
      svgContent += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" rx="4" ry="4" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>`;
      svgContent += `<text x="${x + 16}" y="${y + 30}" fill="#000" font-family="sans-serif" font-size="16px">${escapeHtml(stroke.text || '')}</text>`;
    } else if (stroke.type === 'text') {
      const x = stroke.points[0].x;
      const y = stroke.points[0].y;
      const fontSize = Math.max(14, stroke.width * 4);
      svgContent += `<text x="${x}" y="${y + fontSize}" fill="${color}" font-family="sans-serif" font-size="${fontSize}px">${escapeHtml(stroke.text || '')}</text>`;
    }
  });

  svgContent += `</svg>`;
  
  const ext = 'svg';
  const name = (filename || 'boarddo').trim();
  
  const link = document.createElement("a");
  link.download = `${name}.${ext}`;
  link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
  link.click();
}

function exportRaster(strokes: Stroke[], width: number, height: number, minX: number, minY: number, options: ExportOptions) {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const scale = options.scale;
  const totalScale = dpr * scale;
  
  canvas.width = width * totalScale;
  canvas.height = height * totalScale;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  ctx.scale(totalScale, totalScale);
  ctx.translate(-minX, -minY);
  
  if (!options.transparent || options.format === 'jpeg') {
    ctx.fillStyle = '#f5f5f5'; // default canvas background
    ctx.fillRect(minX, minY, width, height);
  }

  // Draw strokes
  strokes.forEach(stroke => {
    if (stroke.type === 'text' || stroke.type === 'sticky') {
      const p = stroke.points[0];
      const { w, h } = getNoteDimensions(stroke);
      if (stroke.type === 'sticky') {
        ctx.fillStyle = stroke.color;
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, w, h, 8);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        
        ctx.fillStyle = '#000';
        ctx.font = '16px sans-serif';
        ctx.textBaseline = 'top';
        wrapText(ctx, stroke.text || '', p.x + 16, p.y + 16, w - 32, 24);
      } else {
        ctx.fillStyle = stroke.color;
        ctx.font = `${Math.max(14, stroke.width * 4)}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(stroke.text || '', p.x, p.y);
      }
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.width;

    if (stroke.type === "eraser" || stroke.color === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.fillStyle = "rgba(0,0,0,1)";
      if (!options.transparent && options.format !== 'jpeg') {
         // eraser on non-transparent export actually just paints the background color #f5f5f5
         ctx.globalCompositeOperation = "source-over";
         ctx.strokeStyle = "#f5f5f5";
         ctx.fillStyle = "#f5f5f5";
      }
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
    }

    if (stroke.type === 'pen' || stroke.type === 'eraser') {
      if (stroke.points.length < 2) { ctx.restore(); return; }
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, midX, midY);
      }
      const last = stroke.points[stroke.points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    } else if (stroke.type === 'rect') {
      if (stroke.points.length < 2) { ctx.restore(); return; }
      const p1 = stroke.points[0];
      const p2 = stroke.points[1];
      ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
    } else if (stroke.type === 'circle') {
      if (stroke.points.length < 2) { ctx.restore(); return; }
      const p1 = stroke.points[0];
      const p2 = stroke.points[1];
      const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });

  const mime = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mime, 0.95);
  
  const ext = options.format === 'jpeg' ? 'jpg' : options.format;
  const name = (options.filename || 'boarddo').trim();

  const link = document.createElement("a");
  link.download = `${name}.${ext}`;
  link.href = dataUrl;
  link.click();
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    
    // Also handle literal newlines
    if (words[n].includes('\\n')) {
      const parts = words[n].split('\\n');
      line += parts[0];
      ctx.fillText(line, x, currentY);
      line = parts[1] + ' ';
      currentY += lineHeight;
      continue;
    }

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

// Removed downloadBlob polyfill in favor of file-saver
