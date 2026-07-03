import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "") ||
  "https://vsajmskrbiyauigzyiof.supabase.co";
const SUPABASE_KEY = "sb_publishable_UnExE_cIVhEhaLTImCRj7w_J_j-AoBE";
const DISCORD_REDIRECT_TO = (import.meta.env.VITE_DISCORD_REDIRECT_TO as string | undefined)?.trim();
const DISCORD_LOGIN_ENABLED = ["true", "1", "yes"].includes(
  ((import.meta.env.VITE_DISCORD_LOGIN_ENABLED as string | undefined) ?? "").trim().toLowerCase(),
);
const STORAGE_KEY = "ptr.auth.v1";

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  email: string;
};

type AuthCtx = {
  session: StoredSession | null;
  login: (email: string, password: string) => Promise<void>;
  discordLoginEnabled: boolean;
  loginWithDiscord: () => void;
  loginWithBearerToken: (token: string) => Promise<void>;
  logout: () => void;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const Ctx = createContext<AuthCtx | null>(null);

function readStored(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function writeStored(s: StoredSession | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
}

async function exchangePassword(email: string, password: string): Promise<StoredSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Sign-in failed (${res.status})`;
    try {
      const j = JSON.parse(text);
      msg = j.error_description || j.msg || j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user?: { email?: string };
  };
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at,
    email: j.user?.email ?? email,
  };
}

async function fetchOAuthUser(access_token: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${access_token}`,
    },
  });
  if (!res.ok) return "";
  const j = (await res.json()) as { email?: string };
  return j.email ?? "";
}

async function validateBearerToken(token: string): Promise<StoredSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = "Invalid or expired token";
    try {
      const j = JSON.parse(text);
      msg = j.error_description || j.msg || j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = (await res.json()) as { email?: string };
  return {
    access_token: token,
    refresh_token: "",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    email: j.email ?? "",
  };
}

async function refreshSession(refresh_token: string): Promise<StoredSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ refresh_token }),
  });
  if (!res.ok) throw new Error("Session expired. Please sign in again.");
  const j = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user?: { email?: string };
  };
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at,
    email: j.user?.email ?? "",
  };
}

export function PtrAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);

  useEffect(() => {
    // Handle OAuth callback — tokens arrive in the URL hash
    const hash = window.location.hash.slice(1);
    if (hash.includes("access_token=")) {
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const expires_at_raw = params.get("expires_at");
      const expires_in_raw = params.get("expires_in");
      if (access_token && refresh_token) {
        const expires_at = expires_at_raw
          ? Number(expires_at_raw)
          : Math.floor(Date.now() / 1000) + Number(expires_in_raw ?? 3600);
        history.replaceState(null, "", window.location.pathname + window.location.search);
        fetchOAuthUser(access_token).then((email) => {
          const s: StoredSession = { access_token, refresh_token, expires_at, email };
          sessionRef.current = s;
          setSession(s);
          writeStored(s);
        });
        return;
      }
    }
    const s = readStored();
    if (s) {
      setSession(s);
      sessionRef.current = s;
    }
  }, []);

  const update = useCallback((s: StoredSession | null) => {
    sessionRef.current = s;
    setSession(s);
    writeStored(s);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const s = await exchangePassword(email, password);
      update(s);
    },
    [update],
  );

  const logout = useCallback(() => update(null), [update]);

  const loginWithDiscord = useCallback(() => {
    if (!DISCORD_LOGIN_ENABLED) return;
    const redirectTo = DISCORD_REDIRECT_TO || window.location.origin;
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=discord&redirect_to=${encodeURIComponent(redirectTo)}`;
  }, []);

  const loginWithBearerToken = useCallback(
    async (token: string) => {
      const s = await validateBearerToken(token);
      update(s);
    },
    [update],
  );

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      let s = sessionRef.current;
      if (s && s.expires_at * 1000 - Date.now() < 60_000) {
        try {
          s = await refreshSession(s.refresh_token);
          update(s);
        } catch (e) {
          update(null);
          throw e;
        }
      }
      const headers = new Headers(init?.headers);
      if (s) headers.set("Authorization", `Bearer ${s.access_token}`);
      return fetch(path, { ...init, headers });
    },
    [update],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      login,
      discordLoginEnabled: DISCORD_LOGIN_ENABLED,
      loginWithDiscord,
      loginWithBearerToken,
      logout,
      authFetch,
    }),
    [session, login, loginWithDiscord, loginWithBearerToken, logout, authFetch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePtrAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePtrAuth must be used inside PtrAuthProvider");
  return v;
}
