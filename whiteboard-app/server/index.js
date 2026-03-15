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
// For now, single board — we'll add rooms later
const strokes = [];

// ===== Connection handling =====
// Helper to broadcast user count
function broadcastUserCount() {
  io.emit("user-count", io.engine.clientsCount);
}

io.on("connection", (socket) => {
  console.log(`✏️  User connected: ${socket.id} (${io.engine.clientsCount} online)`);

  // Send existing strokes to the newly connected client
  socket.emit("load-strokes", strokes);
  broadcastUserCount();

  // Handle new stroke from a client
  socket.on("draw", (stroke) => {
    strokes.push(stroke);
    // Broadcast to all OTHER clients (not the sender)
    socket.broadcast.emit("draw", stroke);
  });

  // Handle undo — remove last stroke by this user
  socket.on("undo", (strokeId) => {
    const index = strokes.findIndex((s) => s.id === strokeId);
    if (index !== -1) {
      strokes.splice(index, 1);
      // Broadcast full state to keep everyone in sync
      io.emit("sync-strokes", strokes);
    }
  });

  // Handle clear canvas
  socket.on("clear", () => {
    strokes.length = 0;
    io.emit("sync-strokes", strokes);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`👋 User disconnected: ${socket.id} (${io.engine.clientsCount} online)`);
    broadcastUserCount();
  });
});

// ===== Health check endpoint =====
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    connections: io.engine.clientsCount,
    strokes: strokes.length,
  });
});

// ===== Start server =====
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Whiteboard server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});
