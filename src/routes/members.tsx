import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePtrAuth } from "../lib/ptr-auth";

export const Route = createFileRoute("/members")({
  component: MembersPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-destructive">Something went wrong: {error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-3 rounded-md border border-input px-3 py-1.5 text-xs"
        >
          Try again
        </button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">Not found.</div>
  ),
});

type Nation = { id: number; name: string };
type Party = {
  id: number;
  name: string;
  abbreviation: string;
  color: string | null;
  logo_url: string | null;
  seat_count: number;
  is_active: boolean;
};
type Position = {
  id: number;
  title: string;
  display_order: number;
  current_holder: { political_figure_id: number; name: string } | null;
};
type Figure = {
  id: number;
  name?: string;
  full_name?: string;
  charisma?: number;
  experience?: number;
  age?: number;
  gender?: string;
  is_active?: boolean;
  party_id?: number;
};

function colorLuma(hex: string) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function borderForColor(hex: string) {
  return colorLuma(hex) > 0.92 ? "#cbd5e1" : "transparent";
}

function MembersPage() {
  const { session, authFetch } = usePtrAuth();
  const [nations, setNations] = useState<Nation[] | null>(null);
  const [nationId, setNationId] = useState<number | null>(null);
  const [parties, setParties] = useState<Party[] | null>(null);
  const [partyId, setPartyId] = useState<number | null>(null);

  const [positions, setPositions] = useState<Position[] | null>(null);
  const [figures, setFigures] = useState<Figure[] | null>(null);
  const [figuresErr, setFiguresErr] = useState<string | null>(null);
  const [loadingFigures, setLoadingFigures] = useState(false);

  useEffect(() => {
    fetch("/api/ptr/nations")
      .then((r) => r.json())
      .then((d: Nation[]) => {
        const sorted = [...d].sort((a, b) => a.name.localeCompare(b.name));
        setNations(sorted);
        const saved = typeof window !== "undefined" ? localStorage.getItem("ptr.nationId") : null;
        const initial = saved && sorted.find((n) => n.id === Number(saved))
          ? Number(saved)
          : sorted[0]?.id ?? null;
        setNationId(initial);
      })
      .catch(() => setNations([]));
  }, []);

  useEffect(() => {
    if (nationId == null) return;
    if (typeof window !== "undefined") localStorage.setItem("ptr.nationId", String(nationId));
    setParties(null);
    setPartyId(null);
    fetch(`/api/ptr/parties?nation_id=${nationId}&active_only=true`)
      .then((r) => r.json())
      .then((d: Party[]) => {
        const sorted = [...d].sort((a, b) => (b.seat_count ?? 0) - (a.seat_count ?? 0));
        setParties(sorted);
        setPartyId(sorted[0]?.id ?? null);
      })
      .catch(() => setParties([]));
  }, [nationId]);

  const loadPartyDetail = useCallback(
    async (id: number) => {
      setPositions(null);
      setFigures(null);
      setFiguresErr(null);
      // Positions endpoint is public
      try {
        const r = await fetch(`/api/ptr/parties/${id}/positions`);
        if (r.ok) setPositions(await r.json());
        else setPositions([]);
      } catch {
        setPositions([]);
      }
      // Figures endpoint requires auth
      if (!session) {
        setFigures(null);
        return;
      }
      setLoadingFigures(true);
      try {
        const r = await authFetch(`/api/ptr/parties/${id}/political-figures`);
        if (!r.ok) {
          const text = await r.text();
          throw new Error(
            r.status === 401
              ? "Session expired. Please sign in again."
              : `Failed (${r.status}) ${text.slice(0, 120)}`,
          );
        }
        const data = (await r.json()) as Figure[];
        setFigures(data);
      } catch (e) {
        setFiguresErr((e as Error).message);
      } finally {
        setLoadingFigures(false);
      }
    },
    [authFetch, session],
  );

  useEffect(() => {
    if (partyId != null) void loadPartyDetail(partyId);
  }, [partyId, loadPartyDetail]);

  const selectedParty = useMemo(
    () => parties?.find((p) => p.id === partyId) ?? null,
    [parties, partyId],
  );

  const positionHolderIds = useMemo(() => {
    const m = new Map<number, string>();
    positions?.forEach((p) => {
      if (p.current_holder)
        m.set(p.current_holder.political_figure_id, p.title);
    });
    return m;
  }, [positions]);

  const sortedFigures = useMemo(() => {
    if (!figures) return null;
    return [...figures].sort((a, b) => {
      const ah = positionHolderIds.has(a.id) ? 0 : 1;
      const bh = positionHolderIds.has(b.id) ? 0 : 1;
      if (ah !== bh) return ah - bh;
      return (a.name ?? a.full_name ?? "").localeCompare(b.name ?? b.full_name ?? "");
    });
  }, [figures, positionHolderIds]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Browse parties and their political figures. Sign in to load members.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Nation
            </label>
            {!nations ? (
              <div className="text-sm text-muted-foreground">Loading nations…</div>
            ) : (
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={nationId ?? ""}
                onChange={(e) => setNationId(e.target.value ? Number(e.target.value) : null)}
              >
                {nations.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Party
            </label>
            {!parties ? (
              <div className="text-sm text-muted-foreground">Loading parties…</div>
            ) : parties.length === 0 ? (
              <div className="text-sm text-muted-foreground">No active parties.</div>
            ) : (
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={partyId ?? ""}
                onChange={(e) => setPartyId(e.target.value ? Number(e.target.value) : null)}
              >
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.abbreviation} — {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {selectedParty && (
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <PartyLogo party={selectedParty} />
              <div>
                <div className="text-sm font-semibold">{selectedParty.name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedParty.abbreviation} · {selectedParty.seat_count} seats
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-tight">Internal positions</h2>
          {!positions ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : positions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No internal positions defined.</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Position</th>
                    <th className="text-left px-3 py-2 font-medium">Holder</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2">{p.title}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {p.current_holder?.name ?? <span className="italic">vacant</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-tight">Political figures</h2>
          {!session ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Sign in (top-right) with your PR:R account to load this party's members.
            </div>
          ) : loadingFigures ? (
            <div className="text-sm text-muted-foreground">Loading members…</div>
          ) : figuresErr ? (
            <div className="text-sm text-destructive">{figuresErr}</div>
          ) : !sortedFigures || sortedFigures.length === 0 ? (
            <div className="text-sm text-muted-foreground">No members found.</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Role</th>
                    <th className="text-right px-3 py-2 font-medium">Charisma</th>
                    <th className="text-right px-3 py-2 font-medium">Experience</th>
                    <th className="text-right px-3 py-2 font-medium">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFigures.map((f) => {
                    const name = f.name ?? f.full_name ?? `Figure #${f.id}`;
                    const role = positionHolderIds.get(f.id);
                    return (
                      <tr key={f.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{name}</td>
                        <td className="px-3 py-2">
                          {role ? (
                            <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium">
                              {role}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Member</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.charisma ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.experience ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.age ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function PartyLogo({ party }: { party: Party }) {
  const color = party.color || "#999999";
  return (
    <div
      className="h-10 w-10 rounded-md p-1 flex items-center justify-center shrink-0"
      style={{ background: color, border: `1.5px solid ${borderForColor(color)}` }}
    >
      {party.logo_url ? (
        <img
          src={party.logo_url}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <span className="text-[10px] font-bold text-white mix-blend-difference">
          {party.abbreviation.slice(0, 3)}
        </span>
      )}
    </div>
  );
}
