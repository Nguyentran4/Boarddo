import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { Stroke } from "../components/Whiteboard";

const SERVER_URL = "http://localhost:3001";

// ===== Types =====
export interface RemoteCursor {
  id: string;
  x: number;
  y: number;
  color: string;
  name: string;
}

export interface UserIdentity {
  id: string;
  color: string;
  name: string;
}

interface UseSocketReturn {
  isConnected: boolean;
  connectedUsers: number;
  remoteCursors: Map<string, RemoteCursor>;
  userIdentity: UserIdentity | null;
  emitStroke: (stroke: Stroke) => void;
  emitUndo: (strokeId: string) => void;
  emitClear: () => void;
  emitCursor: (x: number, y: number) => void;
}

// Throttle helper — limits how frequently a function fires
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...args: any[]) => {
    const now = Date.now();
    const remaining = ms - (now - lastCall);
    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastCall = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now();
        timeout = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

export function useSocket(
  boardId: string,
  onRemoteStroke: (stroke: Stroke) => void,
  onSyncStrokes: (strokes: Stroke[]) => void,
  onLoadStrokes: (strokes: Stroke[]) => void
): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);

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
      console.log(`🟢 Connected to whiteboard server — joining board: ${boardId}`);
      setIsConnected(true);
      socket.emit("join-board", boardId);
    });

    socket.on("disconnect", () => {
      console.log("🔴 Disconnected from whiteboard server");
      setIsConnected(false);
      setRemoteCursors(new Map());
    });

    // Receive our own identity (color + name)
    socket.on("user-identity", (identity: UserIdentity) => {
      console.log(`🎨 Assigned identity: "${identity.name}" (${identity.color})`);
      setUserIdentity(identity);
    });

    // Receive existing strokes when first joining
    socket.on("load-strokes", (strokes: Stroke[]) => {
      console.log(`📥 Loaded ${strokes.length} existing strokes for board: ${boardId}`);
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

    // Track connected users count in this board
    socket.on("user-count", (count: number) => {
      setConnectedUsers(count);
    });

    // ===== Cursor presence events =====
    socket.on("cursor", (cursor: RemoteCursor) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(cursor.id, cursor);
        return next;
      });
    });

    socket.on("cursor-leave", (userId: string) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    // Clean up cursors when board state resets
    socket.on("board-users", () => {
      // Clear old cursors — positions will arrive via "cursor" events
      setRemoteCursors(new Map());
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [boardId]);

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

  // Throttled cursor emit — sends at most every 30ms (~33fps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emitCursor = useCallback(
    throttle((x: number, y: number) => {
      socketRef.current?.emit("cursor", { x, y });
    }, 30),
    []
  );

  return {
    isConnected,
    connectedUsers,
    remoteCursors,
    userIdentity,
    emitStroke,
    emitUndo,
    emitClear,
    emitCursor,
  };
}
