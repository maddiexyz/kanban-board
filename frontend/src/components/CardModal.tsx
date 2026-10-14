import React, { useState, useEffect } from "react";
import { X, UserCheck } from "lucide-react";
import type { Card, WorkspaceMember } from "../types";

interface CardModalProps {
  card: Card | null;
  members: WorkspaceMember[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    cardId: string,
    title: string,
    description: string,
    assigneeId: string | null
  ) => void;
}

export const CardModal: React.FC<CardModalProps> = ({
  card,
  members,
  isOpen,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDesc(card.description || "");
      setAssigneeId(card.assignee_id || "");
    }
  }, [card]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !card) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(card.id, title.trim(), desc.trim(), assigneeId || null);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink_black-100/80 backdrop-blur-sm cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-ink_black-400 border border-dark_teal-300 shadow-2xl shadow-ink_black-100/90 p-6 animate-in fade-in zoom-in-95 duration-150 cursor-default"
      >
        <div className="flex items-center justify-between pb-3 border-b border-dark_teal-300/40">
          <h2 className="text-lg font-semibold text-vanilla_custard-900">
            Edit Card
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-pearl_aqua-400 hover:text-vanilla_custard-900 rounded-lg hover:bg-dark_teal-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-pearl_aqua-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 bg-ink_black-200 border border-dark_teal-300 rounded-xl text-vanilla_custard-900 text-sm focus:outline-none focus:border-dark_cyan-500 placeholder:text-pearl_aqua-300/60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-pearl_aqua-700 mb-1">
              Description
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              placeholder="Add description..."
              className="w-full px-3 py-2 bg-ink_black-200 border border-dark_teal-300 rounded-xl text-vanilla_custard-900 text-sm focus:outline-none focus:border-dark_cyan-500 resize-none placeholder:text-pearl_aqua-300/60"
            />
          </div>

          {/* Assignee Selector */}
          <div>
            <label className="block text-xs font-medium text-pearl_aqua-700 mb-1 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-dark_cyan-600" />
              Assign Task To
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full px-3 py-2 bg-ink_black-200 border border-dark_teal-300 rounded-xl text-vanilla_custard-900 text-sm focus:outline-none focus:border-dark_cyan-500"
            >
              <option value="">Unassigned</option>
              {members.map((m) => {
                const name = m.user?.display_name || m.user?.email || m.user_id;
                return (
                  <option key={m.user_id} value={m.user_id}>
                    {name} ({m.role === "owner" ? "Owner" : m.role})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-pearl_aqua-400 hover:text-pearl_aqua-600 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 rounded-xl shadow-lg shadow-dark_cyan-500/25 transition cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
