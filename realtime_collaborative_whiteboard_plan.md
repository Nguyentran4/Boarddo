# Real-Time Collaborative Whiteboard

## Project Overview

A real-time collaborative whiteboard that allows multiple users to draw
on the same canvas simultaneously. Users can share a link to join a
board and see updates instantly as others draw.

This project demonstrates: - Real-time networking - Frontend canvas
rendering - WebSocket communication - System design for collaboration

------------------------------------------------------------------------

# Tech Stack

## Frontend

-   React / Next.js
-   HTML5 Canvas
-   Socket.io Client

## Backend

-   Node.js
-   Express
-   Socket.io

## Deployment

-   Vercel (Frontend)
-   Render / Railway (Backend)

------------------------------------------------------------------------

# Architecture

Client → WebSocket → Server → Broadcast → Other Clients

Drawing actions are sent as stroke data instead of pixels. Each client
reconstructs the drawing using the received strokes.

Example stroke structure:

``` javascript
{
  color: "#000",
  width: 4,
  points: [{x:10,y:20}, {x:12,y:22}]
}
```

------------------------------------------------------------------------

# Development Roadmap (3 Weeks)

## Week 1 -- Core Whiteboard

### Day 1--2: Project Setup

-   Create React project
-   Build canvas component
-   Implement mouse drawing events

Events flow:

mousedown → start drawing\
mousemove → draw line\
mouseup → stop drawing

Deliverable: Working single-user whiteboard

------------------------------------------------------------------------

### Day 3--4: Drawing Engine

Add drawing features: - Brush size - Color picker - Clear canvas - Undo
functionality

Store strokes instead of pixels.

Example structure:

``` javascript
stroke = {
  color,
  width,
  points: [{x,y},{x,y}]
}
```

Deliverable: Stable drawing system

------------------------------------------------------------------------

### Day 5--7: Board State Management

Store stroke history.

Example:

    [stroke1, stroke2, stroke3]

Canvas redraws by iterating through stroke history.

Deliverable: - Undo/Redo - Re-rendering system

------------------------------------------------------------------------

# Week 2 -- Real-Time Collaboration

## Day 8--9: WebSocket Server

Create backend server.

Tech: - Node.js - Express - Socket.io

Example:

``` javascript
io.on("connection", socket => {
  socket.on("draw", data => {
    socket.broadcast.emit("draw", data)
  })
})
```

Deliverable: WebSocket server running

------------------------------------------------------------------------

## Day 10--11: Real-Time Drawing Sync

Flow:

User draws\
→ send stroke data\
→ server broadcasts\
→ other clients render

Client:

``` javascript
socket.emit("draw", stroke)
```

Receiver:

``` javascript
socket.on("draw", stroke => {
  drawStroke(stroke)
})
```

Deliverable: Multiple users drawing simultaneously

------------------------------------------------------------------------

## Day 12--13: Room System

Support multiple boards.

Example URL:

    /board/abc123

Server:

    socket.join(boardId)
    io.to(boardId).emit(...)

Deliverable: - Multiple boards - Shareable links

------------------------------------------------------------------------

## Day 14: Sync Existing Board State

Server stores strokes:

    boardId → strokes[]

When a user joins: - Send existing strokes - Client redraws canvas

Deliverable: New users see previous drawings

------------------------------------------------------------------------

# Week 3 -- Advanced Features

## Day 15--16: Cursor Presence

Show collaborators' cursors.

Example:

    socket.emit("cursor", {x,y})

Display colored cursors for each user.

Deliverable: Live cursor presence

------------------------------------------------------------------------

## Day 17--18: Drawing Tools

Add tools: - Pen - Eraser - Rectangle - Circle - Text

Shape object example:

    type: "pen | rect | circle"

Deliverable: Professional drawing tools

------------------------------------------------------------------------

## Day 19: Performance Optimization

Improve network efficiency.

Techniques: - Throttle mouse events - Debounce drawing updates - Batch
stroke messages

Example:

Send updates every 50ms.

Deliverable: Smooth real-time collaboration

------------------------------------------------------------------------

## Day 20: UI Improvements

Add: - Toolbar - User colors - Board title - Dark mode

Deliverable: Clean and usable interface

------------------------------------------------------------------------

## Day 21: Deployment

Frontend: - Deploy on Vercel

Backend: - Deploy on Render or Railway

Example URL:

    https://yourapp.com/board/abc123

Deliverable: Public working application

------------------------------------------------------------------------

# Optional Advanced Features

Add these to strengthen your resume:

1.  Infinite canvas (pan + zoom)
2.  Board persistence with MongoDB / Redis
3.  Export board as PNG/PDF
4.  Google authentication
5.  CRDT-based conflict resolution

------------------------------------------------------------------------

# Resume Description Example

**Real-Time Collaborative Whiteboard**

-   Built a multi-user whiteboard supporting real-time drawing using
    WebSockets
-   Designed stroke-based rendering engine using HTML5 Canvas
-   Implemented room-based board collaboration and synchronization
-   Optimized network performance by batching drawing updates
-   Deployed full-stack application using React, Node.js, and Socket.io

------------------------------------------------------------------------

# Future Improvements

-   Mobile support
-   Offline mode
-   Version history
-   Layer system
