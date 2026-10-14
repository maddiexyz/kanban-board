import React, { useState } from "react";
import { LogIn, UserPlus, AlertCircle, Sparkles } from "lucide-react";
import { authApi } from "../services/api";
import type { User } from "../types";

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: User) => void;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onSuccess, onClose }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!isOpen || !onClose) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const res = await authApi.register(email, password, displayName.trim() || undefined);
        onSuccess(res.user);
      } else {
        const res = await authApi.login(email, password);
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={() => onClose?.()}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink_black-100/80 backdrop-blur-md ${onClose ? "cursor-pointer" : ""}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-8 shadow-2xl bg-ink_black-400 border border-dark_teal-300 cursor-default"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-dark_teal-500/20 text-dark_cyan-600 mb-3 border border-dark_cyan-500/30 shadow-inner">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-vanilla_custard-900 tracking-tight">
            Kanban
          </h2>
          <p className="text-xs text-pearl_aqua-600 mt-1">
            Collaborative project management
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex p-1 bg-ink_black-200 rounded-xl mb-6 border border-dark_teal-300/40">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
              !isRegister
                ? "bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 text-white shadow"
                : "text-pearl_aqua-600 hover:text-vanilla_custard-900"
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
              isRegister
                ? "bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 text-white shadow"
                : "text-pearl_aqua-600 hover:text-vanilla_custard-900"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Create Account
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-brown_red-300/40 border border-oxidized_iron-500/60 text-oxidized_iron-900 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-oxidized_iron-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-pearl_aqua-700 mb-1.5">
                Display Name (Optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full px-3.5 py-2.5 bg-ink_black-200 border border-dark_teal-300 rounded-xl text-vanilla_custard-900 text-sm focus:outline-none focus:border-dark_cyan-500 transition placeholder:text-pearl_aqua-300/60"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-pearl_aqua-700 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3.5 py-2.5 bg-ink_black-200 border border-dark_teal-300 rounded-xl text-vanilla_custard-900 text-sm focus:outline-none focus:border-dark_cyan-500 transition placeholder:text-pearl_aqua-300/60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-pearl_aqua-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 bg-ink_black-200 border border-dark_teal-300 rounded-xl text-vanilla_custard-900 text-sm focus:outline-none focus:border-dark_cyan-500 transition placeholder:text-pearl_aqua-300/60"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-gradient-to-r from-dark_teal-500 to-dark_cyan-500 hover:from-dark_teal-600 hover:to-dark_cyan-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-dark_cyan-500/25 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Authenticating..." : isRegister ? "Create Free Account" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};
