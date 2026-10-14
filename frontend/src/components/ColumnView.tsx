import React, { useState, useRef, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Trash2 } from "lucide-react";
import type { Column, Card, WorkspaceMember } from "../types";
import { CardItem } from "./CardItem";

interface ColumnViewProps {
  column: Column;
  allColumns: Column[];
  members: WorkspaceMember[];
  onAddCard: (
    columnId: string,
    title: string,
    description?: string,
    assigneeId?: string | null
  ) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (cardId: string) => void;
  onMoveToColumn: (cardId: string, targetColumnId: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

export const ColumnView: React.FC<ColumnViewProps> = ({
  column,
  allColumns,
  members,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onMoveToColumn,
  onDeleteColumn,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const addCardFormRef = useRef<HTMLFormElement>(null);

  // Close Add Card form on click outside or Escape
  useEffect(() => {
    if (!isAdding) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        addCardFormRef.current &&
        !addCardFormRef.current.contains(e.target as Node)
      ) {
        setIsAdding(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsAdding(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAdding]);

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      column,
    },
  });

  const cardIds = column.cards.map((c) => c.id);

  const handleSubmitNewCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddCard(
      column.id,
      newTitle.trim(),
      newDesc.trim() || undefined,
      newAssigneeId || null
    );
    setNewTitle("");
    setNewDesc("");
    setNewAssigneeId("");
    setIsAdding(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-80 shrink-0 rounded-2xl p-3.5 h-full max-h-full transition-colors duration-200 border border-dark_teal-300/40 ${
        isOver ? "ring-2 ring-dark_cyan-500 bg-ink_black-400" : "bg-ink_black-500/85"
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3 border-b border-dark_teal-300/40 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-vanilla_custard-900 text-sm tracking-wide">
            {column.title}
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-dark_teal-200 text-pearl_aqua-600 font-mono font-medium">
            {column.cards.length}
          </span>
        </div>

        <button
          onClick={() => onDeleteColumn(column.id)}
          className="p-1 text-pearl_aqua-400 hover:text-oxidized_iron-600 hover:bg-oxidized_iron-100/40 rounded transition cursor-pointer"
          title="Delete column"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cards Scrollable Container - min-h-0 allows shrinking & scrolling when cards exceed height */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              columns={allColumns}
              members={members}
              onEdit={onEditCard}
              onDelete={onDeleteCard}
              onMoveToColumn={onMoveToColumn}
            />
          ))}
        </SortableContext>

        {column.cards.length === 0 && !isAdding && (
          <div className="h-24 border-2 border-dashed border-dark_teal-300/40 rounded-xl flex items-center justify-center text-xs text-pearl_aqua-400">
            Drop cards here
          </div>
        )}
      </div>

      {/* Add Card Section - anchored at bottom with shrink-0 */}
      <div className="shrink-0 pt-2.5 mt-auto border-t border-dark_teal-300/40">
        {isAdding ? (
          <form
            ref={addCardFormRef}
            onSubmit={handleSubmitNewCard}
            className="p-2.5 rounded-xl bg-ink_black-300 border border-dark_cyan-500/40"
          >
            <input
              type="text"
              autoFocus
              placeholder="Card title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-ink_black-200 text-vanilla_custard-900 text-xs px-2.5 py-1.5 rounded-lg border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500 mb-2 placeholder:text-pearl_aqua-300/60"
            />
            <textarea
              placeholder="Description (optional)..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              className="w-full bg-ink_black-200 text-vanilla_custard-900 text-xs px-2.5 py-1.5 rounded-lg border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500 mb-2 resize-none placeholder:text-pearl_aqua-300/60"
            />

            {/* Member Assignee with Display Name */}
            <select
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
              className="w-full bg-ink_black-200 text-pearl_aqua-700 text-xs px-2 py-1.5 rounded-lg border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500 mb-2"
            >
              <option value="">Unassigned</option>
              {members.map((m) => {
                const name = m.user?.display_name || m.user?.email || m.user_id;
                return (
                  <option key={m.user_id} value={m.user_id}>
                    Assign: {name}
                  </option>
                );
              })}
            </select>

            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-xs text-pearl_aqua-400 hover:text-pearl_aqua-600 px-2 py-1 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="text-xs font-semibold px-3 py-1 rounded bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 text-white disabled:opacity-50 transition cursor-pointer"
              >
                Add Card
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-pearl_aqua-600 hover:text-vanilla_custard-900 hover:bg-dark_teal-100/50 border border-transparent hover:border-dark_teal-300/40 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-dark_cyan-600" />
            Add Card
          </button>
        )}
      </div>
    </div>
  );
};
