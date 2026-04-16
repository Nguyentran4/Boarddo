import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, "../dist");
const DIST_INDEX = path.join(DIST_DIR, "index.html");

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:5174"];
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  return !origin || allowedOrigins.includes(origin);
}

function corsOrigin(origin, callback) {
  if (isOriginAllowed(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin ${origin} is not allowed by CORS`));
}

const app = express();
app.use(cors({ origin: corsOrigin, credentials: true }));

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: true,
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
const boardPasswords = new Map(); // boardId → password (string or null for public)

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
      if (Array.isArray(data)) {
        return data;
      } else if (data && typeof data === 'object') {
        // New format with metadata
        if (data.password !== undefined) {
          boardPasswords.set(boardId, data.password);
        }
        return data.strokes || [];
      }
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

    // Save with metadata including password
    const data = {
      strokes: toSave,
      password: boardPasswords.get(boardId) || null,
      lastModified: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
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
      result.push({ id: socketId, color: user.color, name: user.name, isAway: user.isAway });
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

  users.set(socket.id, { color: assignedColor, name: assignedName, boardId: null, isAway: false });

  console.log(`✏️  User connected: ${socket.id} as "${assignedName}" (${io.engine.clientsCount} total online)`);

  // Tell this client their assigned identity
  socket.emit("user-identity", { id: socket.id, color: assignedColor, name: assignedName });

  let currentBoard = null;

  // Client joins a specific board
  socket.on("join-board", async (data) => {
    const { boardId, identity, password } = typeof data === "string" ? { boardId: data } : data;
    
    console.log(`📋 User ${socket.id} attempting to join board: ${boardId}, password provided: ${password ? 'yes' : 'no'}`);
    
    // Check password if board is protected
    const boardPassword = boardPasswords.get(boardId);
    console.log(`🔒 Board ${boardId} password status: ${boardPassword ? 'protected' : 'public'}`);
    
    if (boardPassword && boardPassword !== password) {
      console.log(`❌ Password mismatch for board ${boardId}`);
      socket.emit("join-failed", { reason: "invalid_password" });
      return;
    }
    
    console.log(`✅ User ${socket.id} successfully joining board: ${boardId}`);
    
    // Update identity if provided during join
    if (identity) {
      const user = users.get(socket.id);
      if (user) {
        if (identity.name) user.name = identity.name.trim().slice(0, 30);
        if (identity.color) user.color = identity.color;
        // Respond with the confirmed identity
        socket.emit("user-identity", { id: socket.id, color: user.color, name: user.name });
      }
    }
    // Leave previous board if switching
    if (currentBoard && currentBoard !== boardId) {
      socket.leave(currentBoard);
      // Release any locks held in old board
      const released = releaseAllLocks(currentBoard, socket.id);
      if (released.length > 0) {
        released.forEach((id) => io.to(currentBoard).emit("stroke-unlocked", { strokeId: id }));
      }
      // Notify remaining users in old board that this user is gone
      socket.to(currentBoard).emit("cursor-leave", socket.id);
      socket.to(currentBoard).emit("user-left", socket.id);
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

  // Set password for a board (only if board exists and user is the first/only user)
  socket.on("set-board-password", (data) => {
    const { boardId, password } = data;
    if (!currentBoard || currentBoard !== boardId) {
      socket.emit("set-password-failed", { reason: "not_in_board" });
      return;
    }
    
    // Only allow setting password if user is the only one in the board or board has no password yet
    const userCount = io.sockets.adapter.rooms.get(boardId)?.size || 0;
    const existingPassword = boardPasswords.get(boardId);
    
    if (userCount > 1 && existingPassword) {
      socket.emit("set-password-failed", { reason: "board_not_empty" });
      return;
    }
    
    // Set the password (null means public)
    boardPasswords.set(boardId, password || null);
    scheduleSave(boardId);
    
    // Notify all users in the board about the privacy change
    io.to(boardId).emit("board-privacy-changed", { hasPassword: !!password });
    
    console.log(`🔒 Board ${boardId} privacy changed: ${password ? 'protected' : 'public'}`);
  });

  // Handle identity change (name and/or color)
  socket.on("change-identity", (data) => {
    const { name, color } = data;
    const user = users.get(socket.id);
    if (!user) return;

    let changed = false;
    if (name && typeof name === "string") {
      const oldName = user.name;
      user.name = name.trim().slice(0, 30);
      if (oldName !== user.name) {
        console.log(`👤 User ${socket.id} changed name: "${oldName}" -> "${user.name}"`);
        changed = true;
      }
    }

    if (color && typeof color === "string") {
      const oldColor = user.color;
      user.color = color;
      if (oldColor !== user.color) {
        console.log(`🎨 User ${socket.id} changed color: "${oldColor}" -> "${user.color}"`);
        changed = true;
      }
    }

    if (changed) {
      // Update the user identity for the client themselves
      socket.emit("user-identity", { id: socket.id, color: user.color, name: user.name, isAway: user.isAway });
      
      // Notify others in the board if they are in one
      if (currentBoard) {
        socket.to(currentBoard).emit("user-updated", {
          id: socket.id,
          color: user.color,
          name: user.name,
          isAway: user.isAway,
        });
      }
    }
  });

  // Handle away status
  socket.on("user-away", () => {
    const user = users.get(socket.id);
    if (user && !user.isAway) {
      user.isAway = true;
      if (currentBoard) {
        io.to(currentBoard).emit("user-updated", {
          id: socket.id,
          color: user.color,
          name: user.name,
          isAway: true,
        });
      }
    }
  });

  socket.on("user-back", () => {
    const user = users.get(socket.id);
    if (user && user.isAway) {
      user.isAway = false;
      if (currentBoard) {
        io.to(currentBoard).emit("user-updated", {
          id: socket.id,
          color: user.color,
          name: user.name,
          isAway: false,
        });
      }
    }
  });

  // Keep change-name for backward compatibility if needed, but alias it to change-identity
  socket.on("change-name", (data) => {
    socket.emit("change-identity", { name: data.name });
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
      // Notify board that this user is gone
      socket.to(currentBoard).emit("cursor-leave", socket.id);
      socket.to(currentBoard).emit("user-left", socket.id);
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

if (fs.existsSync(DIST_INDEX)) {
  app.use((_req, res) => {
    res.sendFile(DIST_INDEX);
  });
}

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
  console.log(`   Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(`   Data directory: ${DATA_DIR}\n`);
});
