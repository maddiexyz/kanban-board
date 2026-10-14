import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Board, Card, Column, WebSocketMessage } from "../types";
import { getStoredToken } from "../services/api";

export function useWebSocket(boardId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!boardId) return;

    const token = getStoredToken();
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host; // Vite proxy will forward /ws to 127.0.0.1:8000
    const wsUrl = `${protocol}//${host}/ws/boards/${boardId}?token=${token}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Invalidate query to resync any state missed during disconnect
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      // Heartbeat ping every 25s
      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "PING" }));
        }
      }, 25000);
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data);

        // Update TanStack Query Board cache on real-time events
        queryClient.setQueryData<Board>(["board", boardId], (oldBoard) => {
          if (!oldBoard) return oldBoard;

          switch (msg.type) {
            case "CARD_MOVED": {
              const { card_id, target_column_id, new_rank, version } = msg.payload;
              let movedCard: Card | null = null;

              // 1. Remove card from old location
              const columnsWithoutCard = oldBoard.columns.map((col) => {
                const found = col.cards.find((c) => c.id === card_id);
                if (found) {
                  movedCard = {
                    ...found,
                    column_id: target_column_id,
                    rank: new_rank,
                    version,
                  };
                }
                return {
                  ...col,
                  cards: col.cards.filter((c) => c.id !== card_id),
                };
              });

              if (!movedCard) return oldBoard;

              // 2. Insert card into target column and sort by rank
              const updatedColumns = columnsWithoutCard.map((col) => {
                if (col.id === target_column_id) {
                  const newCards = [...col.cards, movedCard!].sort((a, b) =>
                    a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
                  );
                  return { ...col, cards: newCards };
                }
                return col;
              });

              return { ...oldBoard, columns: updatedColumns };
            }

            case "CARD_CREATED": {
              const { card_id, column_id, board_id, title, description, assignee_id, rank, version } =
                msg.payload;
              const newCard: Card = {
                id: card_id,
                column_id,
                board_id,
                title,
                description,
                assignee_id: assignee_id || null,
                rank,
                version: version || 1,
                updated_at: new Date().toISOString(),
              };

              const updatedColumns = oldBoard.columns.map((col) => {
                if (col.id === column_id) {
                  // Avoid duplicates
                  if (col.cards.some((c) => c.id === card_id)) return col;
                  const newCards = [...col.cards, newCard].sort((a, b) =>
                    a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
                  );
                  return { ...col, cards: newCards };
                }
                return col;
              });

              return { ...oldBoard, columns: updatedColumns };
            }

            case "CARD_UPDATED": {
              const { card_id, title, description, assignee_id, version } = msg.payload;
              const updatedColumns = oldBoard.columns.map((col) => ({
                ...col,
                cards: col.cards.map((c) =>
                  c.id === card_id
                    ? {
                        ...c,
                        title: title ?? c.title,
                        description: description !== undefined ? description : c.description,
                        assignee_id: assignee_id !== undefined ? assignee_id : c.assignee_id,
                        version: version ?? c.version,
                      }
                    : c
                ),
              }));
              return { ...oldBoard, columns: updatedColumns };
            }

            case "CARD_DELETED": {
              const { card_id } = msg.payload;
              const updatedColumns = oldBoard.columns.map((col) => ({
                ...col,
                cards: col.cards.filter((c) => c.id !== card_id),
              }));
              return { ...oldBoard, columns: updatedColumns };
            }

            case "COLUMN_CREATED": {
              const { column_id, board_id, title, rank } = msg.payload;
              if (oldBoard.columns.some((c) => c.id === column_id)) return oldBoard;
              const newCol: Column = {
                id: column_id,
                board_id,
                title,
                rank,
                created_at: new Date().toISOString(),
                cards: [],
              };
              const newCols = [...oldBoard.columns, newCol].sort((a, b) =>
                a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
              );
              return { ...oldBoard, columns: newCols };
            }

            case "COLUMN_UPDATED": {
              const { column_id, title } = msg.payload;
              const updatedColumns = oldBoard.columns.map((col) =>
                col.id === column_id ? { ...col, title } : col
              );
              return { ...oldBoard, columns: updatedColumns };
            }

            case "COLUMN_DELETED": {
              const { column_id } = msg.payload;
              const updatedColumns = oldBoard.columns.filter((c) => c.id !== column_id);
              return { ...oldBoard, columns: updatedColumns };
            }

            case "COLUMN_REBALANCED": {
              // Refetch board for freshly spaced ranks
              queryClient.invalidateQueries({ queryKey: ["board", boardId] });
              return oldBoard;
            }

            default:
              return oldBoard;
          }
        });
      } catch {
        // ignore invalid json
      }
    };

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      ws.close();
    };
  }, [boardId, queryClient]);

  return { isConnected };
}
