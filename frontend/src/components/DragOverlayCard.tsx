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
    <div className="w-72 rounded-xl p-3.5 bg-slate-900 border border-indigo-500 shadow-2xl scale-105 rotate-2 pointer-events-none cursor-grabbing">
      <h4 className="text-sm font-semibold text-slate-100 truncate">
        {card.title}
      </h4>

      {card.description && (
        <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed">
          {card.description}
        </p>
      )}

      {assigneeName && (
        <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-end">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300">
            <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold">
              {assigneeInitial}
            </div>
            <span className="max-w-[120px] truncate">{assigneeName}</span>
          </div>
        </div>
      )}
    </div>
  );
};
