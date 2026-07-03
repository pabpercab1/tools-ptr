import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePtrAuth } from "../lib/ptr-auth";

export function SignInBadge() {
  const { session, logout } = usePtrAuth();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  if (session) {
    return (
      <div className="flex w-full items-center justify-between gap-2 text-xs md:w-auto md:justify-start">
        <span className="truncate text-muted-foreground">{session.email}</span>
        <button
          onClick={logout}
          className="shrink-0 cursor-pointer rounded-md border border-input px-2.5 py-1 font-medium text-foreground hover:bg-accent"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
      <span className="text-xs text-muted-foreground md:hidden">Account</span>
      <button
        onClick={() => {
          setClosing(false);
          setOpen(true);
        }}
        className="shrink-0 cursor-pointer rounded-md border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
      >
        Sign in
      </button>
      {open && (
        <SignInModal
          closing={closing}
          onClose={() => setClosing(true)}
          onExited={() => {
            setOpen(false);
            setClosing(false);
          }}
        />
      )}
    </div>
  );
}

function SignInModal({
  onClose,
  onExited,
  closing,
}: {
  onClose: () => void;
  onExited: () => void;
  closing: boolean;
}) {
  const { login, discordLoginEnabled, loginWithDiscord, loginWithBearerToken } = usePtrAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"signin" | "bearer">("signin");
  const [token, setToken] = useState("");
  const [bearerErr, setBearerErr] = useState<string | null>(null);
  const [bearerLoading, setBearerLoading] = useState(false);
  const bearerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setModalVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (closing) {
      setModalVisible(false);
      const timeoutId = window.setTimeout(onExited, 200);
      return () => window.clearTimeout(timeoutId);
    }
  }, [closing, onExited]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const computedPaddingRight = Number.parseFloat(
      window.getComputedStyle(document.body).paddingRight || "0",
    );

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  useEffect(() => {
    if (view === "bearer") {
      bearerInputRef.current?.focus();
    }
  }, [view]);

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

  async function onBearerSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBearerErr(null);
    setBearerLoading(true);
    try {
      await loginWithBearerToken(token.trim());
      onClose();
    } catch (e) {
      setBearerErr((e as Error).message);
    } finally {
      setBearerLoading(false);
    }
  }

  const isBearerView = view === "bearer";

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-200 ${
        modalVisible ? "bg-black/40 opacity-100" : "bg-black/0 opacity-0"
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg transition-all duration-200 ${
          modalVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isBearerView ? "Use Bearer Token" : "Sign in"}
      >
        <h2 className="text-base font-semibold text-foreground">
          {isBearerView ? "Use Bearer Token" : "Sign in to PR:R"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {isBearerView
            ? "Paste your access token to sign in. The token will be stored in your browser."
            : "Uses your PR:R account credentials. Tokens are kept only in your browser."}
        </p>

        <div className="relative mt-4 min-h-[330px] overflow-hidden">
          <div
            className={`transition-all duration-200 ${
              isBearerView
                ? "pointer-events-none absolute inset-0 -translate-x-4 opacity-0"
                : "relative translate-x-0 opacity-100"
            }`}
          >
            <form onSubmit={onSubmit} className="space-y-3">
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
              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <div className="relative my-4 flex items-center">
              <div className="flex-grow border-t border-border" />
              <span className="mx-3 text-xs text-muted-foreground">Other options</span>
              <div className="flex-grow border-t border-border" />
            </div>
            {discordLoginEnabled && (
              <>
                <button
                  type="button"
                  onClick={loginWithDiscord}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#5865F2]" aria-hidden="true">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Continue with Discord
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setErr(null);
                setView("bearer");
              }}
              className="mt-2 w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              Use Bearer Token
            </button>
          </div>

          <div
            className={`transition-all duration-200 ${
              isBearerView
                ? "relative translate-x-0 opacity-100"
                : "pointer-events-none absolute inset-0 translate-x-4 opacity-0"
            }`}
          >
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">How to get your bearer token</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Sign in to PR:R in another tab.</li>
                <li>Open browser Developer Tools and go to Application or Storage.</li>
                <li>Find local storage for this site and copy the access token value.</li>
                <li>Paste it below and click Sign in.</li>
              </ol>
            </div>
            <form onSubmit={onBearerSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Access Token
                </label>
                <textarea
                  ref={bearerInputRef}
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              {bearerErr && <div className="text-xs text-destructive">{bearerErr}</div>}
              <button
                type="submit"
                disabled={bearerLoading}
                className="w-full cursor-pointer rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {bearerLoading ? "Validating…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
        <div className="mt-4 flex items-center">
          <button
            type="button"
            onClick={() => {
              if (isBearerView) {
                setBearerErr(null);
                setView("signin");
                return;
              }
              onClose();
            }}
            className="cursor-pointer rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {isBearerView ? "Back" : "Cancel"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
