import { useEffect, useState } from "react";
import { usePtrAuth } from "../lib/ptr-auth";

export function SignInBadge() {
  const { session, logout } = usePtrAuth();
  const [open, setOpen] = useState(false);

  if (session) {
    return (
      <div className="ml-auto flex items-center gap-2 text-xs">
        <span className="text-muted-foreground hidden sm:inline">{session.email}</span>
        <button
          onClick={logout}
          className="rounded-md border border-input px-2.5 py-1 font-medium text-foreground hover:bg-accent"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="ml-auto">
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
      >
        Sign in
      </button>
      {open && <SignInModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function SignInModal({ onClose }: { onClose: () => void }) {
  const { login } = usePtrAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">Sign in to PR:R</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Uses your PR:R account credentials. Tokens are kept only in your browser.
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {err && <div className="text-xs text-destructive">{err}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
