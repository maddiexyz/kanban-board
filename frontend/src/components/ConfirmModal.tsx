import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  isDestructive = true,
  onConfirm,
  onClose,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink_black-100/80 backdrop-blur-sm animate-in fade-in duration-100 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-ink_black-400 border border-dark_teal-300 shadow-2xl shadow-ink_black-100/90 p-6 animate-in zoom-in-95 duration-150 cursor-default"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isDestructive
                  ? "bg-brown_red-300/40 text-oxidized_iron-600 border border-oxidized_iron-500/50"
                  : "bg-dark_teal-200/60 text-dark_cyan-600 border border-dark_cyan-500/50"
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-vanilla_custard-900">
                {title}
              </h3>
              <p className="text-xs text-pearl_aqua-600 mt-0.5">
                Please confirm this action
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-pearl_aqua-400 hover:text-vanilla_custard-900 rounded-lg hover:bg-dark_teal-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-4 text-xs text-pearl_aqua-700 leading-relaxed bg-ink_black-500/80 p-3.5 rounded-xl border border-dark_teal-300/40">
          {message}
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-pearl_aqua-400 hover:text-vanilla_custard-900 bg-dark_teal-200/60 hover:bg-dark_teal-200 border border-dark_teal-300/40 rounded-xl transition cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-lg transition cursor-pointer ${
              isDestructive
                ? "bg-oxidized_iron-500 hover:bg-oxidized_iron-600 shadow-oxidized_iron-500/30"
                : "bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 shadow-dark_cyan-500/30"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
