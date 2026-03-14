# 🎨 WiteBoard — Real-Time Collaborative Whiteboard

A real-time collaborative whiteboard that lets multiple users draw on the same canvas simultaneously. Share a link, join a board, and see updates instantly as others draw.

![Built with React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-coming%20soon-010101?logo=socketdotio&logoColor=white)

---

## ✨ Features

- **Freehand Drawing** — Smooth bezier-curve rendering for natural-looking strokes
- **Color Palette** — 8 curated colors with one-click switching
- **Brush Size** — Adjustable 1–32px with live preview
- **Eraser** — Canvas-compositing eraser that cleanly removes strokes
- **Undo / Redo** — Full stroke-based history
- **Keyboard Shortcuts** — `P` pen, `E` eraser, `[` `]` brush size, `Ctrl+Z` undo, `Ctrl+Y` redo
- **Pointer Support** — Works with mouse, touch, and stylus (iPad, Surface, etc.)
- **Dark Theme** — Premium UI with glassmorphism toolbar and dot-grid canvas

### 🚧 Coming Soon

- Real-time collaboration via WebSockets (Socket.io)
- Room system with shareable links (`/board/abc123`)
- Live cursor presence for collaborators
- Shape tools (rectangle, circle, text)
- Board persistence (MongoDB / Redis)

---

## 🛠️ Tech Stack

| Layer      | Technology                  |
|------------|-----------------------------|
| Frontend   | React, TypeScript, HTML5 Canvas |
| Build Tool | Vite                        |
| Backend    | Node.js, Express, Socket.io *(planned)* |
| Deployment | Vercel + Render *(planned)* |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20.x or later
- npm v9+

### Installation

```bash
# Clone the repository
git clone https://github.com/Nguyentran4/WiteBoard.git
cd WiteBoard/whiteboard-app

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be running at **http://localhost:5173/**

### Build for Production

```bash
npm run build
npm run preview
```

---

## 📁 Project Structure

```
WiteBoard/
├── realtime_collaborative_whiteboard_plan.md   # Development roadmap
├── whiteboard-app/                             # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Whiteboard.tsx    # Canvas drawing engine
│   │   │   └── Toolbar.tsx       # Drawing tools UI
│   │   ├── App.tsx               # Main app with state management
│   │   ├── index.css             # Design system & styles
│   │   └── main.tsx              # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## ⌨️ Keyboard Shortcuts

| Key           | Action              |
|---------------|----------------------|
| `P`           | Switch to Pen tool   |
| `E`           | Switch to Eraser     |
| `[`           | Decrease brush size  |
| `]`           | Increase brush size  |
| `Ctrl + Z`    | Undo last stroke     |
| `Ctrl + Y`    | Redo last stroke     |

---

## 📋 Development Roadmap

| Week | Focus                        | Status |
|------|------------------------------|--------|
| 1    | Core whiteboard & drawing engine | ✅ Complete |
| 2    | WebSocket server & real-time sync | 🔜 Up next |
| 3    | Advanced features & deployment    | 📋 Planned |

See the full roadmap in [`realtime_collaborative_whiteboard_plan.md`](./realtime_collaborative_whiteboard_plan.md).

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
