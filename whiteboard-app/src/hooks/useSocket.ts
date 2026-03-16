import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { Stroke, Point } from "../components/Whiteboard";

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
  liveStrokes: Map<string, Stroke>;
  userIdentity: UserIdentity | null;
  emitStroke: (stroke: Stroke) => void;
  emitUndo: (strokeId: string) => void;
  emitClear: () => void;
  emitCursor: (x: number, y: number) => void;
  emitDrawStart: (id: string, type: string, color: string, width: number, point: Point) => void;
  emitDrawMove: (id: string, points: Point[], isShape?: boolean) => void;
  emitDrawEnd: (id: string) => void;
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
  const [liveStrokes, setLiveStrokes] = useState<Map<string, Stroke>>(new Map());
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
      setLiveStrokes(new Map());
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

    // Receive a completed stroke from another user
    socket.on("draw", (stroke: Stroke) => {
      // Remove the live preview since the final stroke is here
      setLiveStrokes((prev) => {
        if (prev.has(stroke.id)) {
          const next = new Map(prev);
          next.delete(stroke.id);
          return next;
        }
        return prev;
      });
      onRemoteStrokeRef.current(stroke);
    });

    // Full state sync (after undo/clear by another user)
    socket.on("sync-strokes", (strokes: Stroke[]) => {
      setLiveStrokes(new Map()); // Clear live strokes on full sync
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

    socket.on("board-users", () => {
      setRemoteCursors(new Map());
    });

    // ===== Live stroke streaming events =====
    // Another user started drawing
    socket.on("draw-start", (data: { userId: string; id: string; type: string; color: string; width: number; point: Point }) => {
      setLiveStrokes((prev) => {
        const next = new Map(prev);
        next.set(data.id, {
          id: data.id,
          type: (data.type || "pen") as Stroke["type"],
          color: data.color,
          width: data.width,
          points: [data.point],
        });
        return next;
      });
    });

    // Another user is actively drawing — append or replace points
    socket.on("draw-move", (data: { userId: string; id: string; points: Point[]; isShape?: boolean }) => {
      setLiveStrokes((prev) => {
        const existing = prev.get(data.id);
        if (!existing) return prev;
        const next = new Map(prev);
        if (data.isShape && existing.points.length > 0) {
          // For shapes, keep start point and replace end point
          next.set(data.id, {
            ...existing,
            points: [existing.points[0], ...data.points],
          });
        } else {
          // For pen/eraser, append new points
          next.set(data.id, {
            ...existing,
            points: [...existing.points, ...data.points],
          });
        }
        return next;
      });
    });

    // Another user finished drawing — remove live preview
    socket.on("draw-end", (data: { userId: string; id: string }) => {
      setLiveStrokes((prev) => {
        if (!prev.has(data.id)) return prev;
        const next = new Map(prev);
        next.delete(data.id);
        return next;
      });
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

  // Live stroke emit functions
  const emitDrawStart = useCallback((id: string, type: string, color: string, width: number, point: Point) => {
    socketRef.current?.emit("draw-start", { id, type, color, width, point });
  }, []);

  // Throttled draw-move — sends batched points at most every 30ms
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emitDrawMove = useCallback(
    throttle((id: string, points: Point[], isShape?: boolean) => {
      socketRef.current?.emit("draw-move", { id, points, isShape });
    }, 30),
    []
  );

  const emitDrawEnd = useCallback((id: string) => {
    socketRef.current?.emit("draw-end", { id });
  }, []);

  return {
    isConnected,
    connectedUsers,
    remoteCursors,
    liveStrokes,
    userIdentity,
    emitStroke,
    emitUndo,
    emitClear,
    emitCursor,
    emitDrawStart,
    emitDrawMove,
    emitDrawEnd,
  };
}
