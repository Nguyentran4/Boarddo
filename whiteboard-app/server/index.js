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

// ===== User presence colors =====
const CURSOR_COLORS = [
  "#6c63ff", // Purple
  "#ff6b9d", // Pink
  "#4ade80", // Green
  "#38bdf8", // Blue
  "#facc15", // Yellow
  "#fb923c", // Orange
  "#f87171", // Red
  "#a78bfa", // Lavender
  "#34d399", // Emerald
  "#f472b6", // Fuchsia
  "#60a5fa", // Sky
  "#fbbf24", // Amber
];

const CURSOR_NAMES = [
  "Koala", "Panda", "Fox", "Owl", "Dolphin", "Falcon",
  "Tiger", "Rabbit", "Wolf", "Phoenix", "Lynx", "Otter",
  "Raven", "Eagle", "Bear", "Hawk", "Coral", "Shark",
];

let userCounter = 0;

// Track user info: socketId → { color, name, boardId }
const users = new Map();

// Helper: get count of users in a specific room
async function getRoomUserCount(boardId) {
  const room = io.sockets.adapter.rooms.get(boardId);
  return room ? room.size : 0;
}

// Helper: get all users in a board (for presence list)
function getBoardUsers(boardId) {
  const result = [];
  for (const [socketId, user] of users.entries()) {
    if (user.boardId === boardId) {
      result.push({ id: socketId, color: user.color, name: user.name });
    }
  }
  return result;
}

// ===== Connection handling =====
io.on("connection", (socket) => {
  // Assign a color and name to this user
  const userIndex = userCounter++;
  const userColor = CURSOR_COLORS[userIndex % CURSOR_COLORS.length];
  const userName = CURSOR_NAMES[userIndex % CURSOR_NAMES.length];

  users.set(socket.id, { color: userColor, name: userName, boardId: null });

  console.log(`✏️  User connected: ${socket.id} as "${userName}" (${io.engine.clientsCount} total online)`);

  // Tell this client their assigned identity
  socket.emit("user-identity", { id: socket.id, color: userColor, name: userName });

  let currentBoard = null;

  // Client joins a specific board
  socket.on("join-board", async (boardId) => {
    // Leave previous board if switching
    if (currentBoard && currentBoard !== boardId) {
      socket.leave(currentBoard);
      // Notify remaining users in old board that this cursor is gone
      socket.to(currentBoard).emit("cursor-leave", socket.id);
      const oldCount = await getRoomUserCount(currentBoard);
      io.to(currentBoard).emit("user-count", oldCount);
      console.log(`🚪 ${socket.id} left board: ${currentBoard}`);
    }

    currentBoard = boardId;
    users.get(socket.id).boardId = boardId;
    socket.join(boardId);

    const strokes = getBoardStrokes(boardId);
    console.log(`📋 ${socket.id} joined board: ${boardId} (${strokes.length} strokes)`);

    // Send existing strokes to the newly connected client
    socket.emit("load-strokes", strokes);

    // Update user count for this board
    const userCount = await getRoomUserCount(boardId);
    io.to(boardId).emit("user-count", userCount);

    // Send the presence list of all users already in this board
    socket.emit("board-users", getBoardUsers(boardId));

    // Notify others in the board that a new user joined
    socket.to(boardId).emit("user-joined", {
      id: socket.id,
      color: userColor,
      name: userName,
    });
  });

  // Handle cursor movement
  socket.on("cursor", (data) => {
    if (!currentBoard) return;
    // Broadcast cursor position to all OTHER clients in the board
    socket.to(currentBoard).emit("cursor", {
      id: socket.id,
      x: data.x,
      y: data.y,
      color: userColor,
      name: userName,
    });
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
    console.log(`👋 User disconnected: ${socket.id} "${userName}" (${io.engine.clientsCount} total online)`);
    if (currentBoard) {
      // Notify board that this cursor is gone
      socket.to(currentBoard).emit("cursor-leave", socket.id);
      const userCount = await getRoomUserCount(currentBoard);
      io.to(currentBoard).emit("user-count", userCount);
    }
    users.delete(socket.id);
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
