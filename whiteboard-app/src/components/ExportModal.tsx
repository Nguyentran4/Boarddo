import React, { useState } from "react";
import type { ExportOptions } from "../utils/export";

interface ExportModalProps {
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
}

export default function ExportModal({ onClose, onExport }: ExportModalProps) {
  const [filename, setFilename] = useState<string>('whiteboard-export');
  const [format, setFormat] = useState<'png' | 'jpeg' | 'svg'>('png');
  const [scale, setScale] = useState<number>(2);
  const [transparent, setTransparent] = useState<boolean>(false);
  const [selectionOnly, setSelectionOnly] = useState<boolean>(false);

  return (
    <div className="export-modal-overlay" style={overlayStyle} onClick={onClose}>
      <div className="export-modal" style={modalStyle} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Export Board</h2>
        
        <div style={fieldStyle}>
          <label>File Name</label>
          <input 
             type="text" 
             value={filename} 
             onChange={e => setFilename(e.target.value)} 
             style={inputStyle} 
          />
        </div>

        <div style={fieldStyle}>
          <label>Format</label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value as "png" | "jpeg" | "svg")}
            style={inputStyle}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="svg">SVG</option>
          </select>
        </div>

        {format !== 'svg' && (
          <div style={fieldStyle}>
            <label>Scale (Resolution)</label>
            <select value={scale} onChange={e => setScale(Number(e.target.value))} style={inputStyle}>
              <option value={1}>1x (Normal)</option>
              <option value={2}>2x (High)</option>
              <option value={4}>4x (Ultra)</option>
            </select>
          </div>
        )}

        {format !== 'jpeg' && (
          <div style={fieldStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} />
              Transparent Background
            </label>
          </div>
        )}

        <div style={fieldStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={selectionOnly} onChange={e => setSelectionOnly(e.target.checked)} />
            Export Selection Only
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
          <button onClick={onClose} style={btnStyleSecondary}>Cancel</button>
          <button 
             onClick={() => {
                onExport({ filename: filename || 'whiteboard-export', format, scale, transparent, selectionOnly });
                onClose();
             }} 
             style={btnStylePrimary}
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  padding: '24px',
  borderRadius: '12px',
  width: '320px',
  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
  fontFamily: 'sans-serif',
};

const fieldStyle: React.CSSProperties = {
  marginBottom: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontSize: '14px',
};

const inputStyle: React.CSSProperties = {
  padding: '8px',
  borderRadius: '6px',
  border: '1px solid #ccc',
  fontSize: '14px',
};

const btnStylePrimary: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
};

const btnStyleSecondary: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#f1f5f9',
  color: '#334155',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
};
