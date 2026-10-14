import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2, Plus, Kanban, Sparkles } from "lucide-react";
import type { User, Workspace, Board, WorkspaceMember } from "./types";
import { authApi, workspaceApi, boardApi, getStoredToken } from "./services/api";
import { AuthModal } from "./components/AuthModal";
import { MembersModal } from "./components/MembersModal";
import { Navbar } from "./components/Navbar";
import { BoardView } from "./components/BoardView";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function MainKanbanApp() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Workspaces state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  // Boards state
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);

  // Cloud Sync status
  const [isCloudConnected, setIsCloudConnected] = useState(false);

  // Load members for a workspace
  const loadWorkspaceMembers = useCallback(async (workspaceId: string) => {
    try {
      const detail = await workspaceApi.getDetail(workspaceId);
      setMembers(detail.members || []);
    } catch (err) {
      console.error("Failed to load workspace members:", err);
    }
  }, []);

  // Load boards for a workspace
  const loadBoards = useCallback(async (workspaceId: string) => {
    try {
      const bList = await boardApi.list(workspaceId);
      setBoards(bList);
      if (bList.length > 0) {
        setActiveBoard(bList[0]);
      } else {
        // Create initial board (backend automatically creates 3 default columns: To Do, In Progress, Done)
        const initialBoard = await boardApi.create(workspaceId, "Project Board");
        const refreshedList = await boardApi.list(workspaceId);
        setBoards(refreshedList);
        setActiveBoard(refreshedList[0] || initialBoard);
      }
    } catch (err) {
      console.error("Failed to load boards:", err);
    }
  }, []);

  // Load workspaces for current user
  const loadWorkspaces = useCallback(async () => {
    try {
      const wsList = await workspaceApi.list();
      setWorkspaces(wsList);
      if (wsList.length > 0) {
        const firstWs = wsList[0];
        setActiveWorkspace(firstWs);
        await Promise.all([loadBoards(firstWs.id), loadWorkspaceMembers(firstWs.id)]);
      } else {
        // Auto-create initial workspace if none exists
        const initialWs = await workspaceApi.create("My Workspace");
        setWorkspaces([initialWs]);
        setActiveWorkspace(initialWs);
        await Promise.all([loadBoards(initialWs.id), loadWorkspaceMembers(initialWs.id)]);
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
    }
  }, [loadBoards, loadWorkspaceMembers]);

  // Check authentication on startup
  useEffect(() => {
    async function initAuth() {
      const token = getStoredToken();
      if (!token) {
        setIsAuthOpen(true);
        setIsInitializing(false);
        return;
      }

      try {
        const user = await authApi.getMe();
        setCurrentUser(user);
        await loadWorkspaces();
      } catch {
        setIsAuthOpen(true);
      } finally {
        setIsInitializing(false);
      }
    }

    initAuth();
  }, [loadWorkspaces]);

  const handleAuthSuccess = async (user: User) => {
    setCurrentUser(user);
    setIsAuthOpen(false);
    await loadWorkspaces();
  };

  const handleLogout = async () => {
    await authApi.logout();
    setCurrentUser(null);
    setWorkspaces([]);
    setActiveWorkspace(null);
    setBoards([]);
    setActiveBoard(null);
    setMembers([]);
    setIsAuthOpen(true);
  };

  const handleSelectWorkspace = async (wsId: string) => {
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) {
      setActiveWorkspace(ws);
      setActiveBoard(null);
      await Promise.all([loadBoards(ws.id), loadWorkspaceMembers(ws.id)]);
    }
  };

  const handleCreateWorkspace = async (name: string) => {
    const newWs = await workspaceApi.create(name);
    setWorkspaces((prev) => [newWs, ...prev]);
    setActiveWorkspace(newWs);
    setActiveBoard(null);
    await Promise.all([loadBoards(newWs.id), loadWorkspaceMembers(newWs.id)]);
  };

  const handleRenameWorkspace = async (id: string, name: string) => {
    const updated = await workspaceApi.update(id, name);
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, name: updated.name } : w))
    );
    if (activeWorkspace?.id === id) {
      setActiveWorkspace((prev) => (prev ? { ...prev, name: updated.name } : null));
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    await workspaceApi.delete(id);
    const remaining = workspaces.filter((w) => w.id !== id);
    setWorkspaces(remaining);
    if (activeWorkspace?.id === id) {
      if (remaining.length > 0) {
        setActiveWorkspace(remaining[0]);
        await Promise.all([loadBoards(remaining[0].id), loadWorkspaceMembers(remaining[0].id)]);
      } else {
        await handleCreateWorkspace("My Workspace");
      }
    }
  };

  const handleSelectBoard = (boardId: string) => {
    const b = boards.find((item) => item.id === boardId);
    if (b) {
      setActiveBoard(b);
    }
  };

  const handleCreateBoard = async (title: string) => {
    if (!activeWorkspace) return;
    const newBoard = await boardApi.create(activeWorkspace.id, title);
    const refreshedList = await boardApi.list(activeWorkspace.id);
    setBoards(refreshedList);
    setActiveBoard(refreshedList.find((b) => b.id === newBoard.id) || newBoard);
  };

  const handleRenameBoard = async (id: string, title: string) => {
    const updated = await boardApi.update(id, title);
    setBoards((prev) =>
      prev.map((b) => (b.id === id ? { ...b, title: updated.title } : b))
    );
    if (activeBoard?.id === id) {
      setActiveBoard((prev) => (prev ? { ...prev, title: updated.title } : null));
    }
  };

  const handleDeleteBoard = async (id: string) => {
    await boardApi.delete(id);
    const remaining = boards.filter((b) => b.id !== id);
    setBoards(remaining);
    if (activeBoard?.id === id) {
      setActiveBoard(remaining.length > 0 ? remaining[0] : null);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-ink_black-300 flex flex-col items-center justify-center gap-4 text-pearl_aqua-600">
        <div className="w-10 h-10 rounded-xl bg-dark_teal-500/20 text-dark_cyan-600 flex items-center justify-center border border-dark_cyan-500/30 shadow-lg shadow-dark_teal-500/20">
          <Kanban className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 font-mono text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-dark_cyan-600" />
          <span>Loading Kanban...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink_black-300 text-vanilla_custard-900 flex flex-col selection:bg-dark_cyan-500/35 selection:text-dark_cyan-900">
      {/* Top Navbar */}
      <Navbar
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        boards={boards}
        activeBoard={activeBoard}
        onSelectBoard={handleSelectBoard}
        onCreateBoard={handleCreateBoard}
        onRenameBoard={handleRenameBoard}
        onDeleteBoard={handleDeleteBoard}
        isConnected={isCloudConnected}
        user={currentUser}
        members={members}
        onOpenMembers={() => setIsMembersOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Board View */}
      <main className="flex-1 flex flex-col">
        {activeBoard ? (
          <BoardView
            key={activeBoard.id}
            boardId={activeBoard.id}
            members={members}
            onConnectionChange={setIsCloudConnected}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-3xl bg-dark_teal-500/20 border border-dark_cyan-500/30 flex items-center justify-center text-dark_cyan-600 mb-4 shadow-xl shadow-dark_teal-500/20">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-vanilla_custard-900">No Board Selected</h2>
            <p className="text-sm text-pearl_aqua-600 mt-1 max-w-md">
              Create a board to organize and collaborate on tasks.
            </p>
            {activeWorkspace && (
              <button
                onClick={() => handleCreateBoard("Project Board")}
                className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-dark_cyan-500/25 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create Default Board
              </button>
            )}
          </div>
        )}
      </main>

      {/* Workspace Members Modal */}
      {activeWorkspace && (
        <MembersModal
          isOpen={isMembersOpen}
          onClose={() => setIsMembersOpen(false)}
          workspaceId={activeWorkspace.id}
          members={members}
          currentUserId={currentUser?.id || ""}
          currentUserRole={activeWorkspace.role}
          onMembersUpdated={() => loadWorkspaceMembers(activeWorkspace.id)}
        />
      )}

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onSuccess={handleAuthSuccess}
        onClose={currentUser ? () => setIsAuthOpen(false) : undefined}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainKanbanApp />
    </QueryClientProvider>
  );
}
