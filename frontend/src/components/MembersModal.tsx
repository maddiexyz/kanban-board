import { useState, useEffect } from "react";
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
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink_black-100/80 backdrop-blur-sm cursor-pointer"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl bg-ink_black-400 border border-dark_teal-300 shadow-2xl shadow-ink_black-100/90 p-6 animate-in fade-in zoom-in-95 duration-150 cursor-default"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-dark_teal-300/40">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-dark_cyan-600" />
              <h2 className="text-lg font-semibold text-vanilla_custard-900">
                Workspace Members
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-dark_teal-200 text-pearl_aqua-600 font-mono">
                {members.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-pearl_aqua-400 hover:text-vanilla_custard-900 rounded-lg hover:bg-dark_teal-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-brown_red-300/40 border border-oxidized_iron-500/60 text-oxidized_iron-900 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-oxidized_iron-600" />
              <span>{error}</span>
            </div>
          )}

          {canManage && (
            <form onSubmit={handleAddMember} className="mt-4 p-3 rounded-xl bg-ink_black-300 border border-dark_teal-300/40 flex gap-2 items-center">
              <input
                type="email"
                required
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 bg-ink_black-200 text-vanilla_custard-900 text-xs px-3 py-2 rounded-lg border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500 placeholder:text-pearl_aqua-300/60"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "member" | "admin")}
                className="bg-ink_black-200 text-pearl_aqua-700 text-xs px-2.5 py-2 rounded-lg border border-dark_teal-300 focus:outline-none focus:border-dark_cyan-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 rounded-lg disabled:opacity-50 transition cursor-pointer"
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
                  className="flex items-center justify-between p-3 rounded-xl bg-ink_black-500/80 border border-dark_teal-300/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-dark_teal-200 flex items-center justify-center text-pearl_aqua-700 font-semibold text-xs border border-dark_teal-300/60 shrink-0">
                      {displayName ? initial : <UserIcon className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-vanilla_custard-900 truncate">
                        {displayName}
                        {isSelf && <span className="ml-1.5 text-[10px] text-dark_cyan-600 font-mono">(You)</span>}
                      </p>
                      {email && email !== displayName && (
                        <p className="text-[11px] text-pearl_aqua-600 truncate">{email}</p>
                      )}
                      <div className="flex items-center gap-1 mt-0.5">
                        {isOwner ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-golden_orange-600 font-medium">
                            <Shield className="w-3 h-3" /> Owner
                          </span>
                        ) : (
                          <span className="text-[10px] text-pearl_aqua-400 font-mono capitalize">
                            {m.role}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {canManage && !isOwner && !isSelf && (
                    <button
                      onClick={() => setMemberToRemove(m)}
                      className="p-1.5 text-pearl_aqua-400 hover:text-oxidized_iron-600 hover:bg-oxidized_iron-100/40 rounded-lg transition cursor-pointer"
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
              className="px-4 py-2 text-xs font-semibold text-pearl_aqua-700 hover:text-vanilla_custard-900 bg-dark_teal-200 hover:bg-dark_teal-300 border border-dark_teal-300/60 rounded-xl transition cursor-pointer"
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
