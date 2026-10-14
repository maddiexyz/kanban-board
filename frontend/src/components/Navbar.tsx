import React, { useState, useRef, useEffect } from "react";
import {
  Kanban,
  FolderKanban,
  Plus,
  Cloud,
  CloudOff,
  LogOut,
  ChevronDown,
  User as UserIcon,
  Users,
  Edit2,
  Trash2,
  Check,
  X,
} from "lucide-react";
import type { Workspace, Board, User, WorkspaceMember } from "../types";
import { ConfirmModal } from "./ConfirmModal";

interface NavbarProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onRenameWorkspace: (id: string, name: string) => Promise<void>;
  onDeleteWorkspace: (id: string) => Promise<void>;
  boards: Board[];
  activeBoard: Board | null;
  onSelectBoard: (id: string) => void;
  onCreateBoard: (title: string) => Promise<void>;
  onRenameBoard: (id: string, title: string) => Promise<void>;
  onDeleteBoard: (id: string) => Promise<void>;
  isConnected: boolean;
  user: User | null;
  members: WorkspaceMember[];
  onOpenMembers: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  boards,
  activeBoard,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  isConnected,
  user,
  members,
  onOpenMembers,
  onLogout,
}) => {
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showBoardMenu, setShowBoardMenu] = useState(false);

  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const boardMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        workspaceMenuRef.current &&
        !workspaceMenuRef.current.contains(event.target as Node)
      ) {
        setShowWorkspaceMenu(false);
      }
      if (
        boardMenuRef.current &&
        !boardMenuRef.current.contains(event.target as Node)
      ) {
        setShowBoardMenu(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowWorkspaceMenu(false);
        setShowBoardMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Workspace creation & renaming state
  const [newWsName, setNewWsName] = useState("");
  const [isCreatingWs, setIsCreatingWs] = useState(false);
  const [editingWsId, setEditingWsId] = useState<string | null>(null);
  const [editingWsName, setEditingWsName] = useState("");

  // Board creation & renaming state
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardTitle, setEditingBoardTitle] = useState("");

  // In-app deletion confirmations
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    await onCreateWorkspace(newWsName.trim());
    setNewWsName("");
    setIsCreatingWs(false);
  };

  const handleSaveWorkspaceName = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWsName.trim()) return;
    await onRenameWorkspace(id, editingWsName.trim());
    setEditingWsId(null);
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardTitle.trim()) return;
    await onCreateBoard(newBoardTitle.trim());
    setNewBoardTitle("");
    setIsCreatingBoard(false);
  };

  const handleSaveBoardTitle = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBoardTitle.trim()) return;
    await onRenameBoard(id, editingBoardTitle.trim());
    setEditingBoardId(null);
  };

  const handleConfirmDeleteWorkspace = async () => {
    if (!workspaceToDelete) return;
    await onDeleteWorkspace(workspaceToDelete.id);
    setWorkspaceToDelete(null);
    setShowWorkspaceMenu(false);
  };

  const handleConfirmDeleteBoard = async () => {
    if (!boardToDelete) return;
    await onDeleteBoard(boardToDelete.id);
    setBoardToDelete(null);
    setShowBoardMenu(false);
  };

  const userDisplayName = user?.display_name || user?.email;

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-ink_black-400/90 backdrop-blur-md border-b border-dark_teal-300/40 px-4 py-2.5">
        <div className="flex items-center justify-between gap-4 max-w-[1920px] mx-auto">
          {/* Brand & Selectors */}
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="flex items-center gap-2.5 pr-4 border-r border-dark_teal-300/40">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-dark_teal-500 to-dark_cyan-500 flex items-center justify-center shadow-md shadow-dark_teal-500/30">
                <Kanban className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-vanilla_custard-900 text-sm tracking-tight">
                Kanban
              </span>
            </div>

            {/* Workspace Dropdown */}
            <div ref={workspaceMenuRef} className="relative">
              <button
                onClick={() => {
                  setShowWorkspaceMenu(!showWorkspaceMenu);
                  setShowBoardMenu(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-ink_black-500 hover:bg-dark_teal-100 border border-dark_teal-300 text-xs text-pearl_aqua-700 transition"
              >
                <FolderKanban className="w-3.5 h-3.5 text-dark_cyan-600" />
                <span className="font-medium max-w-[130px] truncate">
                  {activeWorkspace?.name || "Select Workspace"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-pearl_aqua-400" />
              </button>

              {showWorkspaceMenu && (
                <div className="absolute left-0 mt-2 w-72 rounded-xl bg-ink_black-400 border border-dark_teal-300 shadow-2xl shadow-ink_black-100/90 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[11px] font-semibold text-pearl_aqua-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Workspaces</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1 my-1 pr-1">
                    {workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                          activeWorkspace?.id === ws.id
                            ? "bg-dark_teal-200 text-dark_cyan-700 font-medium border border-dark_cyan-500/30"
                            : "text-pearl_aqua-700 hover:bg-dark_teal-100 hover:text-vanilla_custard-900"
                        }`}
                      >
                        {editingWsId === ws.id ? (
                          <form
                            onSubmit={(e) => handleSaveWorkspaceName(ws.id, e)}
                            className="flex items-center gap-1 w-full"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editingWsName}
                              onChange={(e) => setEditingWsName(e.target.value)}
                              className="flex-1 bg-ink_black-200 text-vanilla_custard-900 text-xs px-2 py-1 rounded border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500"
                            />
                            <button
                              type="submit"
                              className="p-1 text-dark_cyan-600 hover:text-dark_cyan-700"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingWsId(null)}
                              className="p-1 text-pearl_aqua-400 hover:text-pearl_aqua-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                onSelectWorkspace(ws.id);
                                setShowWorkspaceMenu(false);
                              }}
                              className="flex-1 text-left truncate mr-2"
                            >
                              {ws.name}
                            </button>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingWsId(ws.id);
                                  setEditingWsName(ws.name);
                                }}
                                className="p-1 text-pearl_aqua-400 hover:text-pearl_aqua-700"
                                title="Rename workspace"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              {workspaces.length > 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWorkspaceToDelete(ws);
                                  }}
                                  className="p-1 text-pearl_aqua-400 hover:text-oxidized_iron-600"
                                  title="Delete workspace"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-dark_teal-300/40">
                    {isCreatingWs ? (
                      <form onSubmit={handleCreateWorkspace} className="space-y-1.5">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Workspace name..."
                          value={newWsName}
                          onChange={(e) => setNewWsName(e.target.value)}
                          className="w-full bg-ink_black-200 text-vanilla_custard-900 text-xs px-2.5 py-1.5 rounded-lg border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500 placeholder:text-pearl_aqua-300/60"
                        />
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setIsCreatingWs(false)}
                            className="text-[11px] text-pearl_aqua-400 px-2 py-1 hover:text-pearl_aqua-600"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="text-[11px] px-2.5 py-1 rounded bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 text-white font-medium shadow-sm transition"
                          >
                            Create
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setIsCreatingWs(true)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-dark_cyan-600 hover:bg-dark_teal-100/50 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        New Workspace
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Members Button */}
            {activeWorkspace && (
              <button
                onClick={onOpenMembers}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-ink_black-500 hover:bg-dark_teal-100 border border-dark_teal-300 text-xs text-pearl_aqua-700 transition"
                title="Manage workspace members"
              >
                <Users className="w-3.5 h-3.5 text-pearl_aqua-400" />
                <span>Members</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-dark_teal-200 text-pearl_aqua-600 font-mono">
                  {members.length}
                </span>
              </button>
            )}

            {/* Board Dropdown */}
            {activeWorkspace && (
              <div ref={boardMenuRef} className="relative">
                <button
                  onClick={() => {
                    setShowBoardMenu(!showBoardMenu);
                    setShowWorkspaceMenu(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-ink_black-500 hover:bg-dark_teal-100 border border-dark_teal-300 text-xs text-pearl_aqua-700 transition"
                >
                  <Kanban className="w-3.5 h-3.5 text-dark_cyan-600" />
                  <span className="font-medium max-w-[140px] truncate">
                    {activeBoard?.title || "Select Board"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-pearl_aqua-400" />
                </button>

                {showBoardMenu && (
                  <div className="absolute left-0 mt-2 w-72 rounded-xl bg-ink_black-400 border border-dark_teal-300 shadow-2xl shadow-ink_black-100/90 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2 py-1 text-[11px] font-semibold text-pearl_aqua-600 uppercase tracking-wider">
                      Boards
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-1 my-1 pr-1">
                      {boards.map((b) => (
                        <div
                          key={b.id}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                            activeBoard?.id === b.id
                              ? "bg-dark_teal-200 text-dark_cyan-700 font-medium border border-dark_cyan-500/30"
                              : "text-pearl_aqua-700 hover:bg-dark_teal-100 hover:text-vanilla_custard-900"
                          }`}
                        >
                          {editingBoardId === b.id ? (
                            <form
                              onSubmit={(e) => handleSaveBoardTitle(b.id, e)}
                              className="flex items-center gap-1 w-full"
                            >
                              <input
                                type="text"
                                autoFocus
                                value={editingBoardTitle}
                                onChange={(e) => setEditingBoardTitle(e.target.value)}
                                className="flex-1 bg-ink_black-200 text-vanilla_custard-900 text-xs px-2 py-1 rounded border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500"
                              />
                              <button
                                type="submit"
                                className="p-1 text-dark_cyan-600 hover:text-dark_cyan-700"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingBoardId(null)}
                                className="p-1 text-pearl_aqua-400 hover:text-pearl_aqua-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </form>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  onSelectBoard(b.id);
                                  setShowBoardMenu(false);
                                }}
                                className="flex-1 text-left truncate mr-2"
                              >
                                {b.title}
                              </button>

                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingBoardId(b.id);
                                    setEditingBoardTitle(b.title);
                                  }}
                                  className="p-1 text-pearl_aqua-400 hover:text-pearl_aqua-700"
                                  title="Rename board"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                {boards.length > 1 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBoardToDelete(b);
                                    }}
                                    className="p-1 text-pearl_aqua-400 hover:text-oxidized_iron-600"
                                    title="Delete board"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      {boards.length === 0 && (
                        <div className="px-2.5 py-2 text-xs text-pearl_aqua-400 italic">
                          No boards yet
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-dark_teal-300/40">
                      {isCreatingBoard ? (
                        <form onSubmit={handleCreateBoard} className="space-y-1.5">
                          <input
                            type="text"
                            autoFocus
                            placeholder="Board title..."
                            value={newBoardTitle}
                            onChange={(e) => setNewBoardTitle(e.target.value)}
                            className="w-full bg-ink_black-200 text-vanilla_custard-900 text-xs px-2.5 py-1.5 rounded-lg border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500 placeholder:text-pearl_aqua-300/60"
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setIsCreatingBoard(false)}
                              className="text-[11px] text-pearl_aqua-400 px-2 py-1 hover:text-pearl_aqua-600"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="text-[11px] px-2.5 py-1 rounded bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 text-white font-medium shadow-sm transition"
                            >
                              Create
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          onClick={() => setIsCreatingBoard(true)}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-dark_cyan-600 hover:bg-dark_teal-100/50 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          New Board
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Section: Cloud Sync Status & User Profile */}
          <div className="flex items-center gap-3">
            {/* Cloud Sync Status Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                isConnected
                  ? "bg-dark_teal-100/80 border-dark_cyan-400/50 text-dark_cyan-700"
                  : "bg-golden_orange-100/80 border-golden_orange-400/50 text-golden_orange-700"
              }`}
            >
              {isConnected ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-dark_cyan-600" />
                  <span>Cloud Synced</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-golden_orange-600 animate-pulse" />
                  <span>Syncing...</span>
                </>
              )}
            </div>

            {/* User badge with Display Name */}
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-dark_teal-300/40">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-ink_black-500 border border-dark_teal-300 text-xs text-pearl_aqua-700"
                  title={user.email}
                >
                  <UserIcon className="w-3.5 h-3.5 text-dark_cyan-600" />
                  <span className="font-semibold text-vanilla_custard-900 max-w-[140px] truncate">
                    {userDisplayName}
                  </span>
                </div>

                <button
                  onClick={onLogout}
                  className="p-1.5 text-pearl_aqua-400 hover:text-oxidized_iron-600 hover:bg-oxidized_iron-100/40 rounded-xl transition"
                  title="Log Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* In-app confirmation modal for Workspace Deletion */}
      <ConfirmModal
        isOpen={Boolean(workspaceToDelete)}
        title="Delete Workspace"
        message={`Are you sure you want to delete workspace "${workspaceToDelete?.name}"? All boards, columns, and tasks inside it will be permanently deleted.`}
        confirmText="Delete Workspace"
        onConfirm={handleConfirmDeleteWorkspace}
        onClose={() => setWorkspaceToDelete(null)}
      />

      {/* In-app confirmation modal for Board Deletion */}
      <ConfirmModal
        isOpen={Boolean(boardToDelete)}
        title="Delete Board"
        message={`Are you sure you want to delete board "${boardToDelete?.title}"? All columns and tasks inside this board will be permanently deleted.`}
        confirmText="Delete Board"
        onConfirm={handleConfirmDeleteBoard}
        onClose={() => setBoardToDelete(null)}
      />
    </>
  );
};
