import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { Stroke } from "../components/Whiteboard";

const SERVER_URL = "http://localhost:3001";

interface UseSocketReturn {
  isConnected: boolean;
  connectedUsers: number;
  emitStroke: (stroke: Stroke) => void;
  emitUndo: (strokeId: string) => void;
  emitClear: () => void;
}

export function useSocket(
  onRemoteStroke: (stroke: Stroke) => void,
  onSyncStrokes: (strokes: Stroke[]) => void,
  onLoadStrokes: (strokes: Stroke[]) => void
): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(0);

  // Store callbacks in refs to avoid re-connecting on every render
  const onRemoteStrokeRef = useRef(onRemoteStroke);
  const onSyncStrokesRef = useRef(onSyncStrokes);
  const onLoadStrokesRef = useRef(onLoadStrokes);

  useEffect(() => {
    onRemoteStrokeRef.current = onRemoteStroke;
    onSyncStrokesRef.current = onSyncStrokes;
    onLoadStrokesRef.current = onLoadStrokes;
  }, [onRemoteStroke, onSyncStrokes, onLoadStrokes]);

  // ===== Connect to server =====
  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🟢 Connected to whiteboard server");
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("🔴 Disconnected from whiteboard server");
      setIsConnected(false);
    });

    // Receive existing strokes when first joining
    socket.on("load-strokes", (strokes: Stroke[]) => {
      console.log(`📥 Loaded ${strokes.length} existing strokes`);
      onLoadStrokesRef.current(strokes);
    });

    // Receive a new stroke from another user
    socket.on("draw", (stroke: Stroke) => {
      onRemoteStrokeRef.current(stroke);
    });

    // Full state sync (after undo/clear by another user)
    socket.on("sync-strokes", (strokes: Stroke[]) => {
      onSyncStrokesRef.current(strokes);
    });

    // Track connected users count
    socket.on("user-count", (count: number) => {
      setConnectedUsers(count);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ===== Emit functions =====
  const emitStroke = useCallback((stroke: Stroke) => {
    socketRef.current?.emit("draw", stroke);
  }, []);

  const emitUndo = useCallback((strokeId: string) => {
    socketRef.current?.emit("undo", strokeId);
  }, []);

  const emitClear = useCallback(() => {
    socketRef.current?.emit("clear");
  }, []);

  return {
    isConnected,
    connectedUsers,
    emitStroke,
    emitUndo,
    emitClear,
  };
}
