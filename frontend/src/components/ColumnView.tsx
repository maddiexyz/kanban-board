import React, { useState } from "react";
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
      className={`flex flex-col w-80 shrink-0 rounded-2xl p-3.5 h-full max-h-full transition-colors duration-200 border border-slate-800 ${
        isOver ? "ring-2 ring-indigo-500 bg-slate-900" : "bg-slate-900/60"
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-100 text-sm tracking-wide">
            {column.title}
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono font-medium">
            {column.cards.length}
          </span>
        </div>

        <button
          onClick={() => onDeleteColumn(column.id)}
          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
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
          <div className="h-24 border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-500">
            Drop cards here
          </div>
        )}
      </div>

      {/* Add Card Section - anchored at bottom with shrink-0 */}
      <div className="shrink-0 pt-2.5 mt-auto border-t border-slate-800/80">
        {isAdding ? (
          <form
            onSubmit={handleSubmitNewCard}
            className="p-2.5 rounded-xl bg-slate-950 border border-indigo-500/40"
          >
            <input
              type="text"
              autoFocus
              placeholder="Card title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-slate-900 text-slate-100 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 mb-2"
            />
            <textarea
              placeholder="Description (optional)..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              className="w-full bg-slate-900 text-slate-100 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 mb-2 resize-none"
            />

            {/* Member Assignee with Display Name */}
            <select
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
              className="w-full bg-slate-900 text-slate-300 text-xs px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 mb-2"
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
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="text-xs font-medium px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              >
                Add Card
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent hover:border-slate-800 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Card
          </button>
        )}
      </div>
    </div>
  );
};
