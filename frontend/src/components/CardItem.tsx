import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreVertical, Edit2, Trash2, ArrowRight } from "lucide-react";
import type { Card, Column, WorkspaceMember } from "../types";

interface CardItemProps {
  card: Card;
  columns: Column[];
  members: WorkspaceMember[];
  onEdit: (card: Card) => void;
  onDelete: (cardId: string) => void;
  onMoveToColumn: (cardId: string, targetColumnId: string) => void;
  isOverlay?: boolean;
}

export const CardItem: React.FC<CardItemProps> = ({
  card,
  columns,
  members,
  onEdit,
  onDelete,
  onMoveToColumn,
  isOverlay = false,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: {
      type: "card",
      card,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  // Close context menu on click outside or window resize/scroll
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    }

    function handleScrollOrResize() {
      setShowMenu(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowMenu(false);
      }
    }

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [showMenu]);

  const handleOpenMenuFromButton = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 192; // 12rem = 192px
      let left = rect.right - menuWidth;
      if (left < 10) left = 10;
      let top = rect.bottom + 4;
      if (top + 220 > window.innerHeight) {
        top = Math.max(10, rect.top - 220);
      }
      setMenuCoords({ top, left });
      setShowMenu((prev) => !prev);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 192;
    let left = e.clientX;
    if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10;
    }
    let top = e.clientY + 4;
    if (top + 220 > window.innerHeight - 10) {
      top = Math.max(10, e.clientY - 220);
    }
    setMenuCoords({ top, left });
    setShowMenu(true);
  };

  // Find assignee info
  const assigneeMember = members.find((m) => m.user_id === card.assignee_id);
  const assigneeName =
    assigneeMember?.user?.display_name ||
    assigneeMember?.user?.email ||
    (card.assignee_id ? "Assigned" : null);
  const assigneeInitial = assigneeName ? assigneeName[0].toUpperCase() : null;

  // Other columns for "Move to >"
  const destinationColumns = columns.filter((col) => col.id !== card.column_id);

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onContextMenu={handleContextMenu}
        className={`group relative rounded-xl p-3.5 mb-2.5 transition-all cursor-grab active:cursor-grabbing select-none ${
          isOverlay
            ? "border-dark_cyan-500 shadow-2xl scale-105 rotate-1 bg-ink_black-400 border"
            : "hover:border-dark_teal-400/80 bg-ink_black-400/90 border border-dark_teal-300/40 shadow-sm"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-vanilla_custard-900 flex-1 leading-snug break-words">
            {card.title}
          </h4>

          {/* Three dots menu button */}
          <button
            ref={buttonRef}
            type="button"
            onClick={handleOpenMenuFromButton}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 text-pearl_aqua-400 hover:text-vanilla_custard-900 hover:bg-dark_teal-100 rounded-lg transition shrink-0 cursor-pointer"
            title="Card options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        {card.description && (
          <p className="mt-2 text-xs text-pearl_aqua-600 line-clamp-2 leading-relaxed">
            {card.description}
          </p>
        )}

        {/* Footer: Assignee Badge (Display Name) */}
        {assigneeName && (
          <div className="mt-3 pt-2 border-t border-dark_teal-300/30 flex items-center justify-end">
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-dark_teal-200/90 border border-dark_teal-300/70 text-[11px] text-pearl_aqua-700"
              title={`Assigned to ${assigneeName}`}
            >
              <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-dark_teal-500 to-dark_cyan-500 text-white flex items-center justify-center text-[9px] font-bold">
                {assigneeInitial}
              </div>
              <span className="max-w-[130px] truncate">{assigneeName}</span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Dropdown Menu rendered via Portal outside scrolling containers */}
      {showMenu &&
        menuCoords &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: `${menuCoords.top}px`,
              left: `${menuCoords.left}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-48 rounded-xl bg-ink_black-400 border border-dark_teal-300 shadow-2xl shadow-ink_black-100/90 py-1.5 z-[9999] animate-in fade-in zoom-in-95 duration-100"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onEdit(card);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-pearl_aqua-700 hover:bg-dark_teal-100 hover:text-vanilla_custard-900 transition cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-dark_cyan-600" />
              Edit
            </button>

            {/* Destination Columns ("Move to >") */}
            {destinationColumns.length > 0 && (
              <div className="border-t border-dark_teal-300/40 my-1 pt-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-pearl_aqua-400 uppercase tracking-wider">
                  Move to
                </div>
                {destinationColumns.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onMoveToColumn(card.id, col.id);
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-pearl_aqua-700 hover:bg-dark_teal-200/60 hover:text-dark_cyan-700 transition cursor-pointer"
                  >
                    <span className="truncate">{col.title}</span>
                    <ArrowRight className="w-3 h-3 text-dark_cyan-600" />
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-dark_teal-300/40 my-1 pt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete(card.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-oxidized_iron-600 hover:bg-oxidized_iron-100/40 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
