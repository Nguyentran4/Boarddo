import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 10e6, // 10MB — allow large image strokes
});

// ===== Persistence directory =====
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ===== In-memory stroke storage (per board) =====
const boards = new Map(); // boardId → Stroke[]

// ===== Object-level locking (per board) =====
// boardId → Map<strokeId, { socketId, userName, userColor, timer }>
const boardLocks = new Map();

const LOCK_TIMEOUT_MS = 30_000; // 30 seconds

function getBoardLocks(boardId) {
  if (!boardLocks.has(boardId)) {
    boardLocks.set(boardId, new Map());
  }
  return boardLocks.get(boardId);
}

function lockStroke(boardId, strokeId, socketId, userName, userColor) {
  const locks = getBoardLocks(boardId);

  // If already locked by same user, just refresh the timer
  const existing = locks.get(strokeId);
  if (existing) {
    if (existing.socketId === socketId) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        unlockStroke(boardId, strokeId, socketId);
      }, LOCK_TIMEOUT_MS);
      return true; // Successfully refreshed
    }
    return false; // Locked by another user
  }

  // Acquire the lock
  const timer = setTimeout(() => {
    unlockStroke(boardId, strokeId, socketId);
  }, LOCK_TIMEOUT_MS);

  locks.set(strokeId, { socketId, userName, userColor, timer });
  return true; // Successfully acquired
}

function unlockStroke(boardId, strokeId, socketId) {
  const locks = getBoardLocks(boardId);
  const lock = locks.get(strokeId);
  if (!lock) return false;

  // Only the owner (or timeout) can release — socketId is null when called from timeout
  if (socketId && lock.socketId !== socketId) return false;

  clearTimeout(lock.timer);
  locks.delete(strokeId);

  // Broadcast unlock to the board
  io.to(boardId).emit("stroke-unlocked", { strokeId });
  return true;
}

function releaseAllLocks(boardId, socketId) {
  const locks = getBoardLocks(boardId);
  const released = [];
  for (const [strokeId, lock] of locks.entries()) {
    if (lock.socketId === socketId) {
      clearTimeout(lock.timer);
      locks.delete(strokeId);
      released.push(strokeId);
    }
  }
  return released;
}

// ===== Persistence: Load/Save =====
function getBoardFilePath(boardId) {
  // Sanitize boardId to prevent path traversal
  const safe = boardId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

function loadBoardFromDisk(boardId) {
  const filePath = getBoardFilePath(boardId);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.error(`⚠️  Failed to load board "${boardId}" from disk:`, err.message);
  }
  return [];
}

function saveBoardToDisk(boardId) {
  const strokes = boards.get(boardId);
  if (!strokes) return;
  const filePath = getBoardFilePath(boardId);
  try {
    // Strip large imageUrl data from persistence to keep files small
    // Only save a reference — full image data is kept in memory during session
    const toSave = strokes.map((s) => {
      if (s.type === "image" && s.imageUrl && s.imageUrl.length > 50000) {
        return { ...s, imageUrl: s.imageUrl }; // Keep it — users want persistence
      }
      return s;
    });
    fs.writeFileSync(filePath, JSON.stringify(toSave), "utf-8");
  } catch (err) {
    console.error(`⚠️  Failed to save board "${boardId}" to disk:`, err.message);
  }
}

// Debounced save — don't write to disk on every single stroke
const savePending = new Map(); // boardId → timeout
function scheduleSave(boardId) {
  if (savePending.has(boardId)) {
    clearTimeout(savePending.get(boardId));
  }
  savePending.set(
    boardId,
    setTimeout(() => {
      saveBoardToDisk(boardId);
      savePending.delete(boardId);
    }, 2000) // Save 2s after last change
  );
}

function getBoardStrokes(boardId) {
  if (!boards.has(boardId)) {
    // Try loading from disk first
    const loaded = loadBoardFromDisk(boardId);
    boards.set(boardId, loaded);
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
  const assignedColor = CURSOR_COLORS[userIndex % CURSOR_COLORS.length];
  const assignedName = CURSOR_NAMES[userIndex % CURSOR_NAMES.length];

  users.set(socket.id, { color: assignedColor, name: assignedName, boardId: null });

  console.log(`✏️  User connected: ${socket.id} as "${assignedName}" (${io.engine.clientsCount} total online)`);

  // Tell this client their assigned identity
  socket.emit("user-identity", { id: socket.id, color: assignedColor, name: assignedName });

  let currentBoard = null;

  // Client joins a specific board
  socket.on("join-board", async (boardId) => {
    // Leave previous board if switching
    if (currentBoard && currentBoard !== boardId) {
      socket.leave(currentBoard);
      // Release any locks held in old board
      const released = releaseAllLocks(currentBoard, socket.id);
      if (released.length > 0) {
        released.forEach((id) => io.to(currentBoard).emit("stroke-unlocked", { strokeId: id }));
      }
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

    // Send existing locks
    const locks = getBoardLocks(boardId);
    const lockEntries = [];
    for (const [strokeId, lock] of locks.entries()) {
      lockEntries.push({
        strokeId,
        userId: lock.socketId,
        userName: lock.userName,
        userColor: lock.userColor,
      });
    }
    if (lockEntries.length > 0) {
      socket.emit("load-locks", lockEntries);
    }

    // Update user count for this board
    const userCount = await getRoomUserCount(boardId);
    io.to(boardId).emit("user-count", userCount);

    // Send the presence list of all users already in this board
    socket.emit("board-users", getBoardUsers(boardId));

    // Notify others in the board that a new user joined
    socket.to(boardId).emit("user-joined", {
      id: socket.id,
      color: users.get(socket.id).color,
      name: users.get(socket.id).name,
    });
  });

  // Handle name change
  socket.on("change-name", (data) => {
    const { name } = data;
    if (!name || typeof name !== "string") return;
    
    const user = users.get(socket.id);
    if (user) {
      const oldName = user.name;
      user.name = name.trim().slice(0, 30); // Sanitize
      console.log(`👤 User ${socket.id} changed name: "${oldName}" -> "${user.name}"`);
      
      // Update the user identity for the client themselves
      socket.emit("user-identity", { id: socket.id, color: user.color, name: user.name });
      
      // We don't necessarily need to broadcast it globally now, 
      // as the next cursor movement or lock event will carry the new name.
    }
  });

  // Handle cursor movement
  socket.on("cursor", (data) => {
    if (!currentBoard) return;
    const user = users.get(socket.id);
    if (!user) return;
    socket.to(currentBoard).emit("cursor", {
      id: socket.id,
      x: data.x,
      y: data.y,
      color: user.color,
      name: user.name,
    });
  });

  // ===== Object Locking =====
  socket.on("lock-stroke", (data) => {
    if (!currentBoard) return;
    const { strokeId } = data;
    const user = users.get(socket.id);
    if (!user) return;
    const success = lockStroke(currentBoard, strokeId, socket.id, user.name, user.color);
    if (success) {
      // Broadcast to all users in the board (including sender for confirmation)
      io.to(currentBoard).emit("stroke-locked", {
        strokeId,
        userId: socket.id,
        userName: user.name,
        userColor: user.color,
      });
    } else {
      // Tell the requesting user that the lock failed
      socket.emit("lock-failed", { strokeId });
    }
  });

  socket.on("unlock-stroke", (data) => {
    if (!currentBoard) return;
    const { strokeId } = data;
    unlockStroke(currentBoard, strokeId, socket.id);
    // stroke-unlocked is already emitted inside unlockStroke()
  });

  // ===== Live stroke streaming =====
  // Broadcast when a user starts drawing
  socket.on("draw-start", (data) => {
    if (!currentBoard) return;
    socket.to(currentBoard).emit("draw-start", { ...data, userId: socket.id });
  });

  // Broadcast incremental points as the user draws
  socket.on("draw-move", (data) => {
    if (!currentBoard) return;
    socket.to(currentBoard).emit("draw-move", { ...data, userId: socket.id });
  });

  // Broadcast when a user finishes drawing (clean up live stroke)
  socket.on("draw-end", (data) => {
    if (!currentBoard) return;
    socket.to(currentBoard).emit("draw-end", { ...data, userId: socket.id });
  });

  // Handle completed stroke from a client (persisted)
  socket.on("draw", (stroke) => {
    if (!currentBoard) return;
    const strokes = getBoardStrokes(currentBoard);
    strokes.push(stroke);
    socket.to(currentBoard).emit("draw", stroke);
    scheduleSave(currentBoard);
  });

  // Handle stroke update (move, resize, text edit, etc.)
  socket.on("update-stroke", (updatedStroke) => {
    if (!currentBoard) return;
    const strokes = getBoardStrokes(currentBoard);
    const index = strokes.findIndex((s) => s.id === updatedStroke.id);
    if (index !== -1) {
      strokes[index] = updatedStroke;
    }
    socket.to(currentBoard).emit("update-stroke", updatedStroke);
    scheduleSave(currentBoard);
  });

  // Handle undo — remove stroke by ID (targeted, not full sync)
  socket.on("undo", (strokeId) => {
    if (!currentBoard) return;
    const strokes = getBoardStrokes(currentBoard);
    const index = strokes.findIndex((s) => s.id === strokeId);
    if (index !== -1) {
      strokes.splice(index, 1);
      // Targeted removal — only tell others to remove this specific stroke
      socket.to(currentBoard).emit("remove-stroke", strokeId);
      scheduleSave(currentBoard);
    }
  });

  // Handle redo — re-add a stroke
  socket.on("redo-add", (stroke) => {
    if (!currentBoard) return;
    const strokes = getBoardStrokes(currentBoard);
    strokes.push(stroke);
    socket.to(currentBoard).emit("draw", stroke);
    scheduleSave(currentBoard);
  });

  // Handle batch deletion of strokes
  socket.on("delete-strokes", (strokeIds) => {
    if (!currentBoard) return;
    if (!Array.isArray(strokeIds) || strokeIds.length === 0) return;
    const strokes = getBoardStrokes(currentBoard);
    const idSet = new Set(strokeIds);
    // Remove matching strokes from server state
    const remaining = strokes.filter((s) => !idSet.has(s.id));
    boards.set(currentBoard, remaining);
    // Tell other users to remove these strokes
    socket.to(currentBoard).emit("remove-strokes", strokeIds);
    // Release any locks on deleted strokes
    const locks = getBoardLocks(currentBoard);
    for (const id of strokeIds) {
      if (locks.has(id)) {
        clearTimeout(locks.get(id).timer);
        locks.delete(id);
      }
    }
    scheduleSave(currentBoard);
  });

  // Handle clear canvas
  socket.on("clear", () => {
    if (!currentBoard) return;
    const strokes = getBoardStrokes(currentBoard);
    strokes.length = 0;
    // Release all locks for this board
    const locks = getBoardLocks(currentBoard);
    for (const [, lock] of locks.entries()) {
      clearTimeout(lock.timer);
    }
    locks.clear();
    io.to(currentBoard).emit("sync-strokes", []);
    scheduleSave(currentBoard);
  });

  // Handle disconnect
  socket.on("disconnect", async () => {
    const user = users.get(socket.id);
    const displayName = user ? user.name : "Unknown User";
    console.log(`👋 User disconnected: ${socket.id} "${displayName}" (${io.engine.clientsCount} total online)`);
    if (currentBoard) {
      // Release all locks held by this user
      const released = releaseAllLocks(currentBoard, socket.id);
      if (released.length > 0) {
        console.log(`🔓 Released ${released.length} locks from "${displayName}" on board ${currentBoard}`);
      }
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

// ===== Graceful shutdown: save all boards =====
function saveAllBoards() {
  console.log("💾 Saving all boards to disk...");
  for (const [boardId] of boards.entries()) {
    saveBoardToDisk(boardId);
  }
  // Clear any pending save timers
  for (const [, timer] of savePending.entries()) {
    clearTimeout(timer);
  }
  savePending.clear();
  console.log("✅ All boards saved.");
}

process.on("SIGINT", () => {
  saveAllBoards();
  process.exit(0);
});

process.on("SIGTERM", () => {
  saveAllBoards();
  process.exit(0);
});

// ===== Start server =====
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Whiteboard server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Data directory: ${DATA_DIR}\n`);
});
