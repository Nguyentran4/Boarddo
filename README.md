# WiteBoard

WiteBoard is a real-time collaborative whiteboard built with React, TypeScript, Canvas, Express, and Socket.io. Users can join a board by URL, draw together live, edit objects, and keep board state on disk between sessions.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socketdotio&logoColor=white)

## Current Features

- Real-time board collaboration with Socket.io rooms
- Shareable board URLs such as `/board/:boardId`
- Persistent board state saved in `whiteboard-app/server/data`
- Live collaborator cursors and participant list
- User identity sync with editable display name and presence color
- Board privacy with optional password protection
- Object locking so two people do not edit the same stroke at once
- Pen, eraser, shapes, text, sticky notes, image drop/paste, and select tools
- Infinite canvas with pan, zoom, fit-to-content, minimap, and scrollbars
- Undo, redo, targeted delete, and full-board clear
- Export modal for PNG, JPEG, and SVG downloads

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router |
| Drawing | HTML5 Canvas |
| Realtime | Socket.io client/server |
| Backend | Node.js, Express |
| Persistence | JSON file storage on the server |

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+

### Install

```bash
git clone https://github.com/Nguyentran4/WiteBoard.git
cd WiteBoard/whiteboard-app
npm install
```

### Run locally

Open two terminals in `whiteboard-app`:

```bash
npm run server
```

```bash
npm run dev
```

Frontend runs at `http://localhost:5173` and the Socket.io server runs at `http://localhost:3001`.

### Production build

```bash
npm run build
npm run preview
```

## Project Structure

```text
WiteBoard/
|-- README.md
|-- realtime_collaborative_whiteboard_plan.md
`-- whiteboard-app/
    |-- server/
    |   |-- data/
    |   `-- index.js
    |-- src/
    |   |-- components/
    |   |-- hooks/
    |   |-- pages/
    |   `-- utils/
    `-- package.json
```

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `V` | Select |
| `P` | Pen |
| `E` | Eraser |
| `R` | Rectangle |
| `C` | Circle |
| `L` | Line |
| `A` | Arrow |
| `G` | Triangle |
| `T` | Text |
| `S` | Sticky note |
| `[` / `]` | Brush size down/up |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` or `Ctrl/Cmd + Shift + Z` | Redo |

## Roadmap

The original roadmap has been refreshed to match the current app state. See [`realtime_collaborative_whiteboard_plan.md`](./realtime_collaborative_whiteboard_plan.md) for the next phase: deployment hardening, collaboration polish, and long-term storage improvements.

## Contributing

Contributions are welcome through issues and pull requests.
