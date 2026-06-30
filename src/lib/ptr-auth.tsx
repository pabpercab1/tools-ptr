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

const SUPABASE_URL = "https://vsajmskrbiyauigzyiof.supabase.co";
const SUPABASE_KEY = "sb_publishable_UnExE_cIVhEhaLTImCRj7w_J_j-AoBE";
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
    () => ({ session, login, logout, authFetch }),
    [session, login, logout, authFetch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePtrAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePtrAuth must be used inside PtrAuthProvider");
  return v;
}
