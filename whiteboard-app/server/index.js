import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
  },
});

// ===== In-memory stroke storage (per board) =====
const boards = new Map(); // boardId → Stroke[]

function getBoardStrokes(boardId) {
  if (!boards.has(boardId)) {
    boards.set(boardId, []);
  }
  return boards.get(boardId);
}

// Helper: get count of users in a specific room
async function getRoomUserCount(boardId) {
  const room = io.sockets.adapter.rooms.get(boardId);
  return room ? room.size : 0;
}

// ===== Connection handling =====
io.on("connection", (socket) => {
  console.log(`✏️  User connected: ${socket.id} (${io.engine.clientsCount} total online)`);

  let currentBoard = null;

  // Client joins a specific board
  socket.on("join-board", async (boardId) => {
    // Leave previous board if switching
    if (currentBoard && currentBoard !== boardId) {
      socket.leave(currentBoard);
      console.log(`🚪 ${socket.id} left board: ${currentBoard}`);
      // Notify remaining users in old board
      const oldCount = await getRoomUserCount(currentBoard);
      io.to(currentBoard).emit("user-count", oldCount);
    }

    currentBoard = boardId;
    socket.join(boardId);

    const strokes = getBoardStrokes(boardId);
    console.log(`📋 ${socket.id} joined board: ${boardId} (${strokes.length} strokes)`);

    // Send existing strokes to the newly connected client
    socket.emit("load-strokes", strokes);

    // Update user count for this board
    const userCount = await getRoomUserCount(boardId);
    io.to(boardId).emit("user-count", userCount);
  });

  // Handle new stroke from a client
  socket.on("draw", (stroke) => {
    if (!currentBoard) return;
    const strokes = getBoardStrokes(currentBoard);
    strokes.push(stroke);
    // Broadcast to all OTHER clients in the same board
    socket.to(currentBoard).emit("draw", stroke);
  });

  // Handle undo — remove stroke by ID
  socket.on("undo", (strokeId) => {
    if (!currentBoard) return;
    const strokes = getBoardStrokes(currentBoard);
    const index = strokes.findIndex((s) => s.id === strokeId);
    if (index !== -1) {
      strokes.splice(index, 1);
      // Broadcast full state to keep everyone in the board in sync
      io.to(currentBoard).emit("sync-strokes", [...strokes]);
    }
  });

  // Handle clear canvas
  socket.on("clear", () => {
    if (!currentBoard) return;
    const strokes = getBoardStrokes(currentBoard);
    strokes.length = 0;
    io.to(currentBoard).emit("sync-strokes", []);
  });

  // Handle disconnect
  socket.on("disconnect", async () => {
    console.log(`👋 User disconnected: ${socket.id} (${io.engine.clientsCount} total online)`);
    if (currentBoard) {
      const userCount = await getRoomUserCount(currentBoard);
      io.to(currentBoard).emit("user-count", userCount);
    }
  });
});

// ===== Health check endpoint =====
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    connections: io.engine.clientsCount,
    activeBoards: boards.size,
    boards: Object.fromEntries(
      [...boards.entries()].map(([id, strokes]) => [id, { strokes: strokes.length }])
    ),
  });
});

// ===== Start server =====
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Whiteboard server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});
