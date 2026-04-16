# Boarddo

Boarddo is a real-time collaborative whiteboard built with React, TypeScript, Canvas, Express, and Socket.io. Users can join a board by URL, draw together live, edit objects, and keep board state on disk between sessions.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socketdotio&logoColor=white)

## Current Features

- Real-time board collaboration with Socket.io rooms
- Shareable board URLs such as `/board/:boardId`
- Persistent board state saved in `boarddo-app/server/data`
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
git clone https://github.com/Nguyentran4/Boarddo.git
cd Boarddo/boarddo-app
npm install
```

### Configure local env

Frontend:

```bash
cp .env.example .env.local
```

Backend optional env:

```bash
PORT=3001
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

`VITE_SOCKET_URL` defaults to the current origin when unset, so set it only when your frontend and backend run on different origins.

### Run locally

Open two terminals in `boarddo-app`:

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

## Deployment

- Frontend socket target is controlled by `VITE_SOCKET_URL`.
- Backend allowed origins are controlled by `CORS_ORIGIN` as a comma-separated list.
- If you deploy behind one domain with a reverse proxy, you can omit `VITE_SOCKET_URL` and allow the frontend to connect back to its own origin.
- Runtime board files in `boarddo-app/server/data` are intentionally not committed.

## Project Structure

```text
Boarddo/
|-- README.md
`-- boarddo-app/
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

## Contributing

Contributions are welcome through issues and pull requests.
