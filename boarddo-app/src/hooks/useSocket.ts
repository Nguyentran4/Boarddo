import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { Stroke, Point } from "../components/BoarddoCanvas";

const SERVER_URL = import.meta.env.VITE_SOCKET_URL?.trim() || window.location.origin;

// ===== Types =====
export interface RemoteCursor {
  id: string;
  // Shared board-space coordinates, transformed into each viewer's screen locally.
  x: number;
  y: number;
  color: string;
  name: string;
}

export interface UserIdentity {
  id: string;
  color: string;
  name: string;
  isAway?: boolean;
}

export interface StrokeLock {
  strokeId: string;
  userId: string;
  userName: string;
  userColor: string;
}

interface UseSocketReturn {
  isConnected: boolean;
  connectedUsers: number;
  remoteCursors: Map<string, RemoteCursor>;
  liveStrokes: Map<string, Stroke>;
  userIdentity: UserIdentity | null;
  boardUsers: Map<string, UserIdentity>;
  lockedStrokes: Map<string, StrokeLock>;
  emitStroke: (stroke: Stroke) => void;
  emitUndo: (strokeId: string) => void;
  emitRedoAdd: (stroke: Stroke) => void;
  emitClear: () => void;
  emitCursor: (x: number, y: number) => void;
  emitDrawStart: (id: string, type: string, color: string, width: number, point: Point, fillStyle?: "outline" | "solid" | "semi", strokeStyle?: "solid" | "dashed" | "dotted") => void;
  emitDrawMove: (id: string, points: Point[], isShape?: boolean) => void;
  emitDrawEnd: (id: string) => void;
  emitUpdateStroke: (stroke: Stroke) => void;
  emitLockStroke: (strokeId: string) => void;
  emitUnlockStroke: (strokeId: string) => void;
  emitDeleteStrokes: (strokeIds: string[]) => void;
  emitUpdateIdentity: (name?: string, color?: string) => void;
  emitSetBoardPassword: (boardId: string, password: string | null) => void;
  rejoinBoard: (newPassword?: string) => void;
  onJoinFailed?: (reason: string) => void;
  onBoardPrivacyChanged?: (hasPassword: boolean) => void;
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
  onLoadStrokes: (strokes: Stroke[]) => void,
  onUpdateStroke?: (stroke: Stroke) => void,
  onRemoveStroke?: (strokeId: string) => void,
  onRemoveStrokes?: (strokeIds: string[]) => void,
  password?: string,
  onJoinFailed?: (reason: string) => void,
  onBoardPrivacyChanged?: (hasPassword: boolean) => void
): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const drawMoveBuffersRef = useRef<Map<string, { points: Point[]; isShape?: boolean }>>(new Map());
  const drawMoveFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveStrokeCleanupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [liveStrokes, setLiveStrokes] = useState<Map<string, Stroke>>(new Map());
  const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);
  const [boardUsers, setBoardUsers] = useState<Map<string, UserIdentity>>(new Map());
  const [lockedStrokes, setLockedStrokes] = useState<Map<string, StrokeLock>>(new Map());

  // Store callbacks in refs to avoid re-connecting on every render
  const onRemoteStrokeRef = useRef(onRemoteStroke);
  const onSyncStrokesRef = useRef(onSyncStrokes);
  const onLoadStrokesRef = useRef(onLoadStrokes);
  const onUpdateStrokeRef = useRef(onUpdateStroke || (() => {}));
  const onRemoveStrokeRef = useRef(onRemoveStroke || (() => {}));
  const onRemoveStrokesRef = useRef(onRemoveStrokes || (() => {}));
  const joinFailedRef = useRef(onJoinFailed);
  const boardPrivacyChangedRef = useRef(onBoardPrivacyChanged);
  const passwordRef = useRef(password);

  useEffect(() => {
    onRemoteStrokeRef.current = onRemoteStroke;
    onSyncStrokesRef.current = onSyncStrokes;
    onLoadStrokesRef.current = onLoadStrokes;
    onUpdateStrokeRef.current = onUpdateStroke || (() => {});
    onRemoveStrokeRef.current = onRemoveStroke || (() => {});
    onRemoveStrokesRef.current = onRemoveStrokes || (() => {});
    joinFailedRef.current = onJoinFailed;
    boardPrivacyChangedRef.current = onBoardPrivacyChanged;
    passwordRef.current = password;
  }, [onRemoteStroke, onSyncStrokes, onLoadStrokes, onUpdateStroke, onRemoveStroke, onRemoveStrokes, onJoinFailed, onBoardPrivacyChanged, password]);

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
      
      // Load saved identity if it exists
      const savedName = localStorage.getItem("boarddo_user_name");
      const savedColor = localStorage.getItem("boarddo_user_color");
      const identity = savedName || savedColor ? { name: savedName, color: savedColor } : undefined;

      socket.emit("join-board", { boardId, identity, password: passwordRef.current });
    });

    socket.on("disconnect", () => {
      console.log("🔴 Disconnected from whiteboard server");
      setIsConnected(false);
      setRemoteCursors(new Map());
      setLiveStrokes(new Map());
      setLockedStrokes(new Map());
    });

    // Receive our own identity (color + name)
    socket.on("user-identity", (identity: UserIdentity) => {
      console.log(`🎨 Assigned identity: "${identity.name}" (${identity.color})`);
      setUserIdentity(identity);
      setBoardUsers((prev) => {
        const next = new Map(prev);
        next.set(identity.id, identity);
        return next;
      });
    });

    // Receive existing strokes when first joining
    socket.on("load-strokes", (strokes: Stroke[]) => {
      console.log(`📥 Loaded ${strokes.length} existing strokes for board: ${boardId}`);
      onLoadStrokesRef.current(strokes);
    });

    // Receive existing locks when first joining
    socket.on("load-locks", (locks: StrokeLock[]) => {
      console.log(`🔒 Loaded ${locks.length} existing locks for board: ${boardId}`);
      const lockMap = new Map<string, StrokeLock>();
      for (const lock of locks) {
        lockMap.set(lock.strokeId, lock);
      }
      setLockedStrokes(lockMap);
    });

    // Receive a completed stroke from another user
    socket.on("draw", (stroke: Stroke) => {
      const cleanupTimer = liveStrokeCleanupTimersRef.current.get(stroke.id);
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
        liveStrokeCleanupTimersRef.current.delete(stroke.id);
      }
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

    // Full state sync (after clear by another user)
    socket.on("sync-strokes", (strokes: Stroke[]) => {
      setLiveStrokes(new Map());
      setLockedStrokes(new Map());
      onSyncStrokesRef.current(strokes);
    });

    // Receive a stroke update (position/text changed by another user)
    socket.on("update-stroke", (updatedStroke: Stroke) => {
      onUpdateStrokeRef.current(updatedStroke);
    });

    // Targeted stroke removal (optimized undo from another user)
    socket.on("remove-stroke", (strokeId: string) => {
      onRemoveStrokeRef.current(strokeId);
    });

    // Batch stroke removal (delete key from another user)
    socket.on("remove-strokes", (strokeIds: string[]) => {
      onRemoveStrokesRef.current(strokeIds);
    });

    // ===== Locking events =====
    socket.on("stroke-locked", (lock: StrokeLock) => {
      // Don't show lock for our own strokes — we already have the selection
      if (lock.userId === socket.id) return;
      setLockedStrokes((prev) => {
        const next = new Map(prev);
        next.set(lock.strokeId, lock);
        return next;
      });
    });

    socket.on("stroke-unlocked", (data: { strokeId: string }) => {
      setLockedStrokes((prev) => {
        if (!prev.has(data.strokeId)) return prev;
        const next = new Map(prev);
        next.delete(data.strokeId);
        return next;
      });
    });

    socket.on("lock-failed", (data: { strokeId: string }) => {
      console.log(`🔒 Lock failed for stroke ${data.strokeId} — another user has it`);
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

    socket.on("board-users", (users: UserIdentity[]) => {
      const userMap = new Map<string, UserIdentity>();
      users.forEach((u) => userMap.set(u.id, u));
      setBoardUsers(userMap);
    });

    socket.on("user-joined", (user: UserIdentity) => {
      setBoardUsers((prev) => {
        const next = new Map(prev);
        next.set(user.id, user);
        return next;
      });
    });

    socket.on("user-updated", (user: UserIdentity) => {
      setBoardUsers((prev) => {
        const next = new Map(prev);
        next.set(user.id, user);
        if (user.id === socket.id) {
          setUserIdentity(user);
        }
        return next;
      });
    });

    socket.on("user-left", (userId: string) => {
      setBoardUsers((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    // Handle join failures (e.g., wrong password)
    socket.on("join-failed", (data: { reason: string }) => {
      console.log(`❌ Join failed: ${data.reason}`);
      joinFailedRef.current?.(data.reason);
    });

    // Handle board privacy changes
    socket.on("board-privacy-changed", (data: { hasPassword: boolean }) => {
      console.log(`🔒 Board privacy changed: ${data.hasPassword ? 'protected' : 'public'}`);
      boardPrivacyChangedRef.current?.(data.hasPassword);
    });

    // ===== Live stroke streaming events =====
    // Another user started drawing
    socket.on("draw-start", (data: { userId: string; id: string; type: string; color: string; width: number; point: Point; fillStyle?: "outline" | "solid" | "semi"; strokeStyle?: "solid" | "dashed" | "dotted" }) => {
      setLiveStrokes((prev) => {
        const next = new Map(prev);
        next.set(data.id, {
          id: data.id,
          type: (data.type || "pen") as Stroke["type"],
          color: data.color,
          width: data.width,
          points: [data.point],
          fillStyle: data.fillStyle,
          strokeStyle: data.strokeStyle,
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

    // Another user finished drawing; remove the preview only if the final stroke does not arrive.
    socket.on("draw-end", (data: { userId: string; id: string }) => {
      const existingTimer = liveStrokeCleanupTimersRef.current.get(data.id);
      if (existingTimer) clearTimeout(existingTimer);

      const cleanupTimer = setTimeout(() => {
        setLiveStrokes((prev) => {
          if (!prev.has(data.id)) return prev;
          const next = new Map(prev);
          next.delete(data.id);
          return next;
        });
        liveStrokeCleanupTimersRef.current.delete(data.id);
      }, 1000);

      liveStrokeCleanupTimersRef.current.set(data.id, cleanupTimer);
    });

    return () => {
      if (drawMoveFlushTimerRef.current) {
        clearTimeout(drawMoveFlushTimerRef.current);
        drawMoveFlushTimerRef.current = null;
      }
      drawMoveBuffersRef.current.clear();
      liveStrokeCleanupTimersRef.current.forEach((timer) => clearTimeout(timer));
      liveStrokeCleanupTimersRef.current.clear();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [boardId]);

  // ===== Emit functions =====
  // ===== Inactivity Tracking =====
  useEffect(() => {
    if (!isConnected) return;

    let awayTimeout: ReturnType<typeof setTimeout>;
    const THRESHOLD = 5 * 60 * 1000; // 5 minutes

    const resetInactivity = () => {
      if (userIdentity?.isAway) {
        socketRef.current?.emit("user-back");
      }
      
      clearTimeout(awayTimeout);
      awayTimeout = setTimeout(() => {
        if (isConnected) {
          socketRef.current?.emit("user-away");
        }
      }, THRESHOLD);
    };

    const handleInteraction = throttle(resetInactivity, 1000);

    window.addEventListener("mousemove", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("mousedown", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);

    resetInactivity();

    return () => {
      clearTimeout(awayTimeout);
      window.removeEventListener("mousemove", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("mousedown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, [isConnected, userIdentity?.isAway]);

  const emitStroke = useCallback((stroke: Stroke) => {
    socketRef.current?.emit("draw", stroke);
  }, []);

  const emitUndo = useCallback((strokeId: string) => {
    socketRef.current?.emit("undo", strokeId);
  }, []);

  const emitRedoAdd = useCallback((stroke: Stroke) => {
    socketRef.current?.emit("redo-add", stroke);
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
  const emitDrawStart = useCallback((id: string, type: string, color: string, width: number, point: Point, fillStyle?: "outline" | "solid" | "semi", strokeStyle?: "solid" | "dashed" | "dotted") => {
    socketRef.current?.emit("draw-start", { id, type, color, width, point, fillStyle, strokeStyle });
  }, []);

  // Throttled draw-move: sends every pen point in 30ms batches.
  const flushDrawMoveBuffer = useCallback((targetId?: string) => {
    const entries = Array.from(drawMoveBuffersRef.current.entries())
      .filter(([id]) => !targetId || id === targetId);

    for (const [id, batch] of entries) {
      if (batch.points.length > 0) {
        socketRef.current?.emit("draw-move", {
          id,
          points: batch.points,
          isShape: batch.isShape,
        });
      }
      drawMoveBuffersRef.current.delete(id);
    }

    if (drawMoveBuffersRef.current.size === 0 && drawMoveFlushTimerRef.current) {
      clearTimeout(drawMoveFlushTimerRef.current);
      drawMoveFlushTimerRef.current = null;
    }
  }, []);

  const emitDrawMove = useCallback((id: string, points: Point[], isShape?: boolean) => {
    const existing = drawMoveBuffersRef.current.get(id);
    drawMoveBuffersRef.current.set(id, {
      points: isShape ? points : [...(existing?.points || []), ...points],
      isShape,
    });

    if (!drawMoveFlushTimerRef.current) {
      drawMoveFlushTimerRef.current = setTimeout(() => {
        drawMoveFlushTimerRef.current = null;
        flushDrawMoveBuffer();
      }, 30);
    }
  }, [flushDrawMoveBuffer]);

  const emitDrawEnd = useCallback((id: string) => {
    flushDrawMoveBuffer(id);
    socketRef.current?.emit("draw-end", { id });
  }, [flushDrawMoveBuffer]);

  const emitUpdateStroke = useCallback((stroke: Stroke) => {
    socketRef.current?.emit("update-stroke", stroke);
  }, []);

  const emitLockStroke = useCallback((strokeId: string) => {
    socketRef.current?.emit("lock-stroke", { strokeId });
  }, []);

  const emitUnlockStroke = useCallback((strokeId: string) => {
    socketRef.current?.emit("unlock-stroke", { strokeId });
  }, []);

  const emitDeleteStrokes = useCallback((strokeIds: string[]) => {
    socketRef.current?.emit("delete-strokes", strokeIds);
  }, []);

  const emitUpdateIdentity = useCallback((name?: string, color?: string) => {
    socketRef.current?.emit("change-identity", { name, color });
  }, []);

  const emitSetBoardPassword = useCallback((boardId: string, password: string | null) => {
    socketRef.current?.emit("set-board-password", { boardId, password });
  }, []);

  const rejoinBoard = useCallback((newPassword?: string) => {
    if (!socketRef.current || !isConnected) return;
    
    console.log(`🔄 Manually rejoining board: ${boardId} with password: ${newPassword ? 'provided' : 'none'}`);
    
    // Load saved identity if it exists
    const savedName = localStorage.getItem("boarddo_user_name");
    const savedColor = localStorage.getItem("boarddo_user_color");
    const identity = savedName || savedColor ? { name: savedName, color: savedColor } : undefined;

    socketRef.current.emit("join-board", { boardId, identity, password: newPassword });
  }, [boardId, isConnected]);

  return {
    isConnected,
    connectedUsers,
    remoteCursors,
    liveStrokes,
    userIdentity,
    boardUsers,
    lockedStrokes,
    emitStroke,
    emitUndo,
    emitRedoAdd,
    emitClear,
    emitCursor,
    emitDrawStart,
    emitDrawMove,
    emitDrawEnd,
    emitUpdateStroke,
    emitLockStroke,
    emitUnlockStroke,
    emitDeleteStrokes,
    emitUpdateIdentity,
    emitSetBoardPassword,
    rejoinBoard,
    onJoinFailed,
    onBoardPrivacyChanged,
  };
}
