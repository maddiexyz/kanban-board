import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import type { Board, Card, Column, WorkspaceMember } from "../types";
import { boardApi, columnApi, cardApi } from "../services/api";
import { between } from "../services/lexorank";
import { useWebSocket } from "../hooks/useWebSocket";
import { ColumnView } from "./ColumnView";
import { DragOverlayCard } from "./DragOverlayCard";
import { CardModal } from "./CardModal";
import { ConfirmModal } from "./ConfirmModal";

interface BoardViewProps {
  boardId: string;
  members: WorkspaceMember[];
  onConnectionChange?: (connected: boolean) => void;
}

export const BoardView: React.FC<BoardViewProps> = ({
  boardId,
  members,
  onConnectionChange,
}) => {
  const queryClient = useQueryClient();
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [toast, setToast] = useState<{
    type: "error" | "success" | "info";
    message: string;
  } | null>(null);

  // In-app confirmations
  const [columnToDelete, setColumnToDelete] = useState<Column | null>(null);
  const [cardToDeleteId, setCardToDeleteId] = useState<string | null>(null);

  // New column state
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState("");
  const addColumnFormRef = React.useRef<HTMLFormElement>(null);

  // Close Add Column form on click outside or Escape
  React.useEffect(() => {
    if (!isAddingColumn) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        addColumnFormRef.current &&
        !addColumnFormRef.current.contains(e.target as Node)
      ) {
        setIsAddingColumn(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsAddingColumn(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAddingColumn]);

  // WebSocket connection & live synchronization
  const { isConnected } = useWebSocket(boardId);

  // Notify parent of connection changes
  React.useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  // Fetch Board details
  const {
    data: board,
    isLoading,
    isError,
    error,
  } = useQuery<Board>({
    queryKey: ["board", boardId],
    queryFn: () => boardApi.getDetail(boardId),
  });

  // Setup DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Toast Auto-Dismiss
  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // -------------------------------------------------------------
  // Card Move Mutation with Optimistic Update & 409 Rollback
  // -------------------------------------------------------------
  const moveCardMutation = useMutation({
    mutationFn: (variables: {
      cardId: string;
      targetColumnId: string;
      newRank: string;
      prevRank?: string | null;
      nextRank?: string | null;
      version: number;
    }) =>
      cardApi.move(variables.cardId, {
        target_column_id: variables.targetColumnId,
        rank: variables.newRank,
        prev_rank: variables.prevRank,
        next_rank: variables.nextRank,
        version: variables.version,
      }),
    onMutate: async (newMove) => {
      await queryClient.cancelQueries({ queryKey: ["board", boardId] });
      const previousBoard = queryClient.getQueryData<Board>(["board", boardId]);

      if (previousBoard) {
        let movedCard: Card | null = null;

        const colsWithoutCard = previousBoard.columns.map((col) => {
          const found = col.cards.find((c) => c.id === newMove.cardId);
          if (found) {
            movedCard = {
              ...found,
              column_id: newMove.targetColumnId,
              rank: newMove.newRank,
              version: found.version + 1,
            };
          }
          return {
            ...col,
            cards: col.cards.filter((c) => c.id !== newMove.cardId),
          };
        });

        if (movedCard) {
          const finalCols = colsWithoutCard.map((col) => {
            if (col.id === newMove.targetColumnId) {
              const updatedCards = [...col.cards, movedCard!].sort((a, b) =>
                a.rank.localeCompare(b.rank)
              );
              return { ...col, cards: updatedCards };
            }
            return col;
          });

          queryClient.setQueryData<Board>(["board", boardId], {
            ...previousBoard,
            columns: finalCols,
          });
        }
      }

      return { previousBoard };
    },
    onError: (err: any, _newMove, context) => {
      if (context?.previousBoard) {
        queryClient.setQueryData(["board", boardId], context.previousBoard);
      }

      const isConflict = err?.status === 409;
      setToast({
        type: "error",
        message: isConflict
          ? "Conflict: Card was updated concurrently. Changes rolled back."
          : err?.message || "Failed to move card.",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });

  // -------------------------------------------------------------
  // Card Actions
  // -------------------------------------------------------------
  const handleAddCard = async (
    columnId: string,
    title: string,
    description?: string,
    assigneeId?: string | null
  ) => {
    try {
      await cardApi.create(columnId, title, description, assigneeId);
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Failed to create card" });
    }
  };

  const handleSaveCard = async (
    cardId: string,
    title: string,
    description: string,
    assigneeId: string | null
  ) => {
    try {
      await cardApi.update(cardId, title, description, assigneeId);
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      setToast({ type: "success", message: "Card updated" });
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Failed to update card" });
    }
  };

  const handleConfirmDeleteCard = async () => {
    if (!cardToDeleteId) return;
    try {
      await cardApi.delete(cardToDeleteId);
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      setCardToDeleteId(null);
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Failed to delete card" });
    }
  };

  const handleMoveToColumn = (cardId: string, targetColumnId: string) => {
    if (!board) return;

    const sourceCard = board.columns
      .flatMap((c) => c.cards)
      .find((c) => c.id === cardId);
    if (!sourceCard || sourceCard.column_id === targetColumnId) return;

    const targetCol = board.columns.find((c) => c.id === targetColumnId);
    if (!targetCol) return;

    const lastCard = targetCol.cards[targetCol.cards.length - 1];
    const prevRank = lastCard ? lastCard.rank : null;
    const newRank = between(prevRank, null);

    moveCardMutation.mutate({
      cardId,
      targetColumnId,
      newRank,
      prevRank,
      nextRank: null,
      version: sourceCard.version,
    });
  };

  // -------------------------------------------------------------
  // Column Actions
  // -------------------------------------------------------------
  const handleCreateColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColTitle.trim() || !board) return;

    if (board.columns.length >= 10) {
      setToast({ type: "error", message: "A board can have a maximum of 10 columns." });
      setIsAddingColumn(false);
      return;
    }

    try {
      const lastCol = board.columns[board.columns.length - 1];
      const prevRank = lastCol ? lastCol.rank : null;
      await columnApi.create(boardId, newColTitle.trim(), prevRank, null);
      setNewColTitle("");
      setIsAddingColumn(false);
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Failed to create column" });
    }
  };

  const handleConfirmDeleteColumn = async () => {
    if (!columnToDelete) return;
    try {
      await columnApi.delete(columnToDelete.id);
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      setColumnToDelete(null);
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Failed to delete column" });
    }
  };

  // -------------------------------------------------------------
  // DnD Handlers
  // -------------------------------------------------------------
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const card = active.data.current?.card as Card;
    if (card) {
      setActiveCard(card);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !board) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type !== "card") return;

    const sourceCol = board.columns.find((col) =>
      col.cards.some((c) => c.id === activeId)
    );
    if (!sourceCol) return;

    let targetCol: Column | undefined;
    if (overData?.type === "column") {
      targetCol = board.columns.find((c) => c.id === overId);
    } else if (overData?.type === "card") {
      targetCol = board.columns.find((col) =>
        col.cards.some((c) => c.id === overId)
      );
    }

    if (!targetCol || sourceCol.id === targetCol.id) return;

    queryClient.setQueryData<Board>(["board", boardId], (oldBoard) => {
      if (!oldBoard) return oldBoard;

      const card = sourceCol.cards.find((c) => c.id === activeId);
      if (!card) return oldBoard;

      const newCols = oldBoard.columns.map((col) => {
        if (col.id === sourceCol.id) {
          return {
            ...col,
            cards: col.cards.filter((c) => c.id !== activeId),
          };
        }
        if (col.id === targetCol!.id) {
          const cardsWithoutActive = col.cards.filter((c) => c.id !== activeId);
          const overIndex = cardsWithoutActive.findIndex((c) => c.id === overId);
          const insertIndex =
            overIndex >= 0 ? overIndex : cardsWithoutActive.length;

          const updatedCards = [...cardsWithoutActive];
          updatedCards.splice(insertIndex, 0, {
            ...card,
            column_id: targetCol!.id,
          });
          return { ...col, cards: updatedCards };
        }
        return col;
      });

      return { ...oldBoard, columns: newCols };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over || !board) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    let targetCol = board.columns.find((col) =>
      col.cards.some((c) => c.id === overId)
    );
    if (!targetCol) {
      targetCol = board.columns.find((col) => col.id === overId);
    }

    if (!targetCol) return;

    const cardsInCol = targetCol.cards.filter((c) => c.id !== activeId);

    let insertIndex = cardsInCol.length;
    if (over.data.current?.type === "card") {
      const idx = cardsInCol.findIndex((c) => c.id === overId);
      if (idx !== -1) insertIndex = idx;
    }

    let prevRank: string | null = null;
    let nextRank: string | null = null;

    if (cardsInCol.length === 0) {
      prevRank = null;
      nextRank = null;
    } else if (insertIndex === 0) {
      prevRank = null;
      nextRank = cardsInCol[0].rank;
    } else if (insertIndex >= cardsInCol.length) {
      prevRank = cardsInCol[cardsInCol.length - 1].rank;
      nextRank = null;
    } else {
      prevRank = cardsInCol[insertIndex - 1].rank;
      nextRank = cardsInCol[insertIndex].rank;
    }

    const newRank = between(prevRank, nextRank);

    const sourceCard =
      active.data.current?.card ||
      board.columns.flatMap((c) => c.cards).find((c) => c.id === activeId);

    if (!sourceCard) return;

    moveCardMutation.mutate({
      cardId: activeId,
      targetColumnId: targetCol.id,
      newRank,
      prevRank,
      nextRank,
      version: sourceCard.version,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-7 h-7 text-dark_cyan-600 animate-spin" />
        <p className="text-sm text-pearl_aqua-600 font-medium">Loading board...</p>
      </div>
    );
  }

  if (isError || !board) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-oxidized_iron-600">
        <AlertTriangle className="w-8 h-8" />
        <p className="text-sm font-medium">
          {(error as any)?.message || "Failed to load board"}
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col p-6 overflow-hidden">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md border animate-in slide-in-from-bottom-5 duration-200 ${
            toast.type === "error"
              ? "bg-brown_red-300 border-oxidized_iron-500 text-oxidized_iron-900"
              : toast.type === "success"
              ? "bg-dark_teal-100 border-dark_cyan-500 text-dark_cyan-900"
              : "bg-ink_black-400 border-dark_teal-300 text-vanilla_custard-900"
          }`}
        >
          {toast.type === "error" ? (
            <AlertTriangle className="w-4 h-4 text-oxidized_iron-600 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-dark_cyan-600 shrink-0" />
          )}
          <span className="text-xs font-medium">{toast.message}</span>
        </div>
      )}

      {/* Board Title Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-vanilla_custard-900 tracking-tight">
            {board.title}
          </h1>
          <p className="text-xs text-pearl_aqua-600 mt-0.5">
            {board.columns.length}/10 columns &bull;{" "}
            {board.columns.reduce((sum, col) => sum + col.cards.length, 0)} cards
          </p>
        </div>
      </div>

      {/* Columns Horizontal Scroll Area - items-stretch and min-h-0 so columns fill full height and scroll internally */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 min-h-0 flex gap-5 overflow-x-auto overflow-y-hidden pb-2 items-stretch select-none">
          {board.columns.map((column) => (
            <ColumnView
              key={column.id}
              column={column}
              allColumns={board.columns}
              members={members}
              onAddCard={handleAddCard}
              onEditCard={(c) => setEditingCard(c)}
              onDeleteCard={(cardId) => setCardToDeleteId(cardId)}
              onMoveToColumn={handleMoveToColumn}
              onDeleteColumn={() => setColumnToDelete(column)}
            />
          ))}

          {/* Add Column Button / Form */}
          <div className="w-80 shrink-0 self-start">
            {board.columns.length >= 10 ? (
              <div className="w-full flex flex-col items-center justify-center p-4 rounded-2xl bg-ink_black-400/40 border border-dashed border-dark_teal-300/40 text-center">
                <span className="text-xs font-semibold text-pearl_aqua-600">
                  Column Limit Reached (10/10)
                </span>
                <p className="text-[11px] text-pearl_aqua-400/70 mt-1">
                  Boards allow up to 10 columns
                </p>
              </div>
            ) : isAddingColumn ? (
              <form
                ref={addColumnFormRef}
                onSubmit={handleCreateColumn}
                className="p-3.5 rounded-2xl bg-ink_black-400 border border-dark_cyan-500/40"
              >
                <input
                  type="text"
                  autoFocus
                  placeholder="Column title..."
                  value={newColTitle}
                  onChange={(e) => setNewColTitle(e.target.value)}
                  className="w-full bg-ink_black-200 text-vanilla_custard-900 text-xs px-3 py-2 rounded-xl border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500 mb-3 placeholder:text-pearl_aqua-300/60"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingColumn(false)}
                    className="text-xs text-pearl_aqua-400 hover:text-pearl_aqua-600 px-3 py-1.5 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newColTitle.trim()}
                    className="text-xs font-semibold px-4 py-1.5 rounded-xl bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 text-white disabled:opacity-50 transition cursor-pointer"
                  >
                    Add Column
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingColumn(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-ink_black-400/40 hover:bg-ink_black-400/80 border border-dashed border-dark_teal-300/50 hover:border-dark_cyan-500/60 text-pearl_aqua-600 hover:text-vanilla_custard-900 text-xs font-semibold transition cursor-pointer"
              >
                <Plus className="w-4 h-4 text-dark_cyan-600" />
                Add Column ({board.columns.length}/10)
              </button>
            )}
          </div>
        </div>

        {/* Drag Overlay Card */}
        <DragOverlay>
          {activeCard ? (
            <DragOverlayCard card={activeCard} members={members} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Edit Card Details Modal */}
      <CardModal
        card={editingCard}
        members={members}
        isOpen={Boolean(editingCard)}
        onClose={() => setEditingCard(null)}
        onSave={handleSaveCard}
      />

      {/* In-app confirmation modal for Column Deletion */}
      <ConfirmModal
        isOpen={Boolean(columnToDelete)}
        title="Delete Column"
        message={`Are you sure you want to delete column "${columnToDelete?.title}" and all its ${columnToDelete?.cards.length || 0} tasks? This action cannot be undone.`}
        confirmText="Delete Column"
        onConfirm={handleConfirmDeleteColumn}
        onClose={() => setColumnToDelete(null)}
      />

      {/* In-app confirmation modal for Card Deletion */}
      <ConfirmModal
        isOpen={Boolean(cardToDeleteId)}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete Task"
        onConfirm={handleConfirmDeleteCard}
        onClose={() => setCardToDeleteId(null)}
      />
    </div>
  );
};
