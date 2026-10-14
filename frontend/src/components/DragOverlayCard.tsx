import React from "react";
import type { Card, WorkspaceMember } from "../types";

interface DragOverlayCardProps {
  card: Card;
  members?: WorkspaceMember[];
}

export const DragOverlayCard: React.FC<DragOverlayCardProps> = ({ card, members = [] }) => {
  const assigneeMember = members.find((m) => m.user_id === card.assignee_id);
  const assigneeName =
    assigneeMember?.user?.display_name ||
    assigneeMember?.user?.email ||
    (card.assignee_id ? "Assigned" : null);
  const assigneeInitial = assigneeName ? assigneeName[0].toUpperCase() : null;

  return (
    <div className="w-72 rounded-xl p-3.5 bg-ink_black-400 border border-dark_cyan-500 shadow-2xl scale-105 rotate-2 pointer-events-none cursor-grabbing">
      <h4 className="text-sm font-semibold text-vanilla_custard-900 truncate">
        {card.title}
      </h4>

      {card.description && (
        <p className="mt-2 text-xs text-pearl_aqua-600 line-clamp-2 leading-relaxed">
          {card.description}
        </p>
      )}

      {assigneeName && (
        <div className="mt-3 pt-2 border-t border-dark_teal-300/40 flex items-center justify-end">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-dark_teal-200/90 border border-dark_teal-300/70 text-[11px] text-pearl_aqua-700">
            <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-dark_teal-500 to-dark_cyan-500 text-white flex items-center justify-center text-[9px] font-bold">
              {assigneeInitial}
            </div>
            <span className="max-w-[120px] truncate">{assigneeName}</span>
          </div>
        </div>
      )}
    </div>
  );
};
