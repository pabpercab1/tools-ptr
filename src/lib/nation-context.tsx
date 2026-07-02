import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchNationsWithFlags, type NationWithFlag } from "./nations";

type Ctx = {
  nations: NationWithFlag[] | null;
  nationsErr: string | null;
  nationId: number | null;
  setNationId: (id: number | null) => void;
  selectedNation: NationWithFlag | null;
};

const NationCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "ptr.nationId";

export function NationProvider({ children }: { children: ReactNode }) {
  const [nations, setNations] = useState<Nation[] | null>(null);
  const [nationsErr, setNationsErr] = useState<string | null>(null);
  const [nationId, setNationIdState] = useState<number | null>(null);

  useEffect(() => {
    fetchNationsWithFlags()
      .then((loadedNations) => {
        setNations(loadedNations);
        const saved =
          typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        const initial =
          saved && loadedNations.find((n) => n.id === Number(saved))
            ? Number(saved)
            : null;
        setNationIdState(initial);
      })
      .catch((e) => setNationsErr(String((e as Error).message || e)));
  }, []);

  const setNationId = (id: number | null) => {
    setNationIdState(id);
    if (typeof window !== "undefined") {
      if (id == null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(id));
    }
  };

  const value = useMemo<Ctx>(
    () => ({
      nations,
      nationsErr,
      nationId,
      setNationId,
      selectedNation: nations?.find((n) => n.id === nationId) ?? null,
    }),
    [nations, nationsErr, nationId],
  );

  return <NationCtx.Provider value={value}>{children}</NationCtx.Provider>;
}

export function useNation() {
  const v = useContext(NationCtx);
  if (!v) throw new Error("useNation must be used inside NationProvider");
  return v;
}
