import { useState } from "react";
import { X, Users, UserPlus, Trash2, Shield, User as UserIcon, AlertCircle } from "lucide-react";
import type { WorkspaceMember } from "../types";
import { workspaceApi } from "../services/api";
import { ConfirmModal } from "./ConfirmModal";

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  members: WorkspaceMember[];
  currentUserId: string;
  currentUserRole?: string;
  onMembersUpdated: () => void;
}

export const MembersModal: React.FC<MembersModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  members,
  currentUserId,
  currentUserRole,
  onMembersUpdated,
}) => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMember | null>(null);

  if (!isOpen) return null;

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setLoading(true);

    try {
      await workspaceApi.addMember(workspaceId, email.trim(), role);
      setEmail("");
      onMembersUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return;
    setError(null);

    try {
      await workspaceApi.removeMember(workspaceId, memberToRemove.user_id);
      setMemberToRemove(null);
      onMembersUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to remove member");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-slate-100">
                Workspace Members
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                {members.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Add Member Form */}
          {canManage && (
            <form onSubmit={handleAddMember} className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 flex gap-2 items-center">
              <input
                type="email"
                required
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 bg-slate-900 text-slate-100 text-xs px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "member" | "admin")}
                className="bg-slate-900 text-slate-200 text-xs px-2.5 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50 transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </button>
            </form>
          )}

          {/* Member List */}
          <div className="mt-4 max-h-64 overflow-y-auto space-y-2 pr-1">
            {members.map((m) => {
              const isSelf = m.user_id === currentUserId;
              const isOwner = m.role === "owner";
              const displayName = m.user?.display_name || m.user?.email || m.user_id;
              const email = m.user?.email;
              const initial = displayName[0].toUpperCase();

              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 font-semibold text-xs border border-slate-700 shrink-0">
                      {displayName ? initial : <UserIcon className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {displayName}
                        {isSelf && <span className="ml-1.5 text-[10px] text-indigo-400 font-mono">(You)</span>}
                      </p>
                      {email && email !== displayName && (
                        <p className="text-[11px] text-slate-400 truncate">{email}</p>
                      )}
                      <div className="flex items-center gap-1 mt-0.5">
                        {isOwner ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                            <Shield className="w-3 h-3" /> Owner
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono capitalize">
                            {m.role}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {canManage && !isOwner && !isSelf && (
                    <button
                      onClick={() => setMemberToRemove(m)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* In-app confirmation modal for member removal */}
      <ConfirmModal
        isOpen={Boolean(memberToRemove)}
        title="Remove Member"
        message={`Are you sure you want to remove ${
          memberToRemove?.user?.display_name || memberToRemove?.user?.email || "this member"
        } from the workspace? They will lose access to all boards in this workspace.`}
        confirmText="Remove Member"
        onConfirm={handleConfirmRemove}
        onClose={() => setMemberToRemove(null)}
      />
    </>
  );
};
