import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/majority")({
  head: () => ({
    meta: [
      { title: "Majority Calculator — PR:R Tools" },
      { name: "description", content: "Build coalitions and check simple, absolute and supermajority thresholds." },
    ],
  }),
  component: MajorityTool,
});

const API = "/api/ptr";
const FALLBACK_COLOR = "#999999";

type Nation = { id: number; name: string };
type Party = { id: number; abbreviation: string; name: string; color: string | null };
type DashboardParty = {
  party_id: number;
  party_name: string;
  color: string | null;
  seats: number;
  vote_pct: number;
};
type Dashboard = {
  total_seats: number;
  majority_threshold: number;
  party_results: DashboardParty[];
};

function safeColor(c: string | null | undefined) {
  if (!c) return FALLBACK_COLOR;
  return /^#([0-9a-f]{3}){1,2}$/i.test(c) ? c : FALLBACK_COLOR;
}
function colorLuma(hex: string) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function isNearWhite(hex: string) {
  return colorLuma(hex) > 0.92;
}
function borderForColor(hex: string) {
  return isNearWhite(hex) ? "#cbd5e1" : "transparent";
}

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function MajorityTool() {
  const [nations, setNations] = useState<Nation[]>([]);
  const [nationId, setNationId] = useState<number | null>(null);
  const [nationsErr, setNationsErr] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    jget<Nation[]>("/nations")
      .then((ns) => {
        setNations(ns);
        if (ns.length > 0) setNationId(ns[0].id);
      })
      .catch((e) => setNationsErr(e.message || "Failed to load nations"));
  }, []);

  useEffect(() => {
    if (nationId == null) return;
    setLoading(true);
    setErr(null);
    setSelected(new Set());
    Promise.all([
      jget<Dashboard>(`/nations/${nationId}/elections/dashboard`),
      jget<Party[]>(`/parties?nation_id=${nationId}&active_only=true`),
    ])
      .then(([d, p]) => {
        setDashboard(d);
        setParties(p);
      })
      .catch((e) => setErr(e.message || "Failed to load parliament"))
      .finally(() => setLoading(false));
  }, [nationId]);

  const abbrMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of parties) m.set(p.id, p.abbreviation);
    return m;
  }, [parties]);

  const seatedParties = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.party_results
      .filter((p) => p.seats > 0)
      .sort((a, b) => b.seats - a.seats);
  }, [dashboard]);

  const totalSeats = dashboard?.total_seats ?? 0;
  const coalitionSeats = useMemo(
    () => seatedParties.filter((p) => selected.has(p.party_id)).reduce((s, p) => s + p.seats, 0),
    [seatedParties, selected],
  );
  const largestOpponent = useMemo(() => {
    const opp = seatedParties.filter((p) => !selected.has(p.party_id));
    return opp.reduce((m, p) => Math.max(m, p.seats), 0);
  }, [seatedParties, selected]);

  const absoluteNeeded = Math.floor(totalSeats / 2) + 1;
  const superNeeded = Math.ceil((totalSeats * 2) / 3);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Majority Calculator</h1>
          <p className="text-sm text-muted-foreground">
            Build a coalition from current parliamentary seats and check whether it clears each majority threshold.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">Nation</label>
          {nationsErr ? (
            <div className="text-sm text-destructive">{nationsErr}</div>
          ) : (
            <select
              className="w-full sm:w-80 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={nationId ?? ""}
              onChange={(e) => setNationId(Number(e.target.value))}
            >
              {nations.length === 0 && <option value="">Loading…</option>}
              {nations.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          )}
        </section>

        {loading && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Loading parliament…
          </div>
        )}
        {err && !loading && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-destructive">
            {err}
          </div>
        )}

        {dashboard && !loading && !err && (
          <>
            {/* Threshold summary */}
            <section className="grid gap-3 sm:grid-cols-3">
              <ThresholdCard
                label="Simple majority (plurality)"
                desc="More seats than the largest non-coalition party"
                current={coalitionSeats}
                needed={largestOpponent + 1}
                pass={coalitionSeats > largestOpponent && coalitionSeats > 0}
                suffix={` (vs ${largestOpponent})`}
              />
              <ThresholdCard
                label="Absolute majority (50%+1)"
                desc={`${absoluteNeeded} of ${totalSeats} seats`}
                current={coalitionSeats}
                needed={absoluteNeeded}
                pass={coalitionSeats >= absoluteNeeded}
              />
              <ThresholdCard
                label="Supermajority (⅔)"
                desc={`${superNeeded} of ${totalSeats} seats`}
                current={coalitionSeats}
                needed={superNeeded}
                pass={coalitionSeats >= superNeeded}
              />
            </section>

            {/* Coalition bar */}
            <section className="rounded-lg border border-border bg-card p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Coalition</div>
                  <div className="text-xl font-bold tabular-nums">
                    {coalitionSeats} <span className="text-sm font-normal text-muted-foreground">/ {totalSeats} seats ({totalSeats > 0 ? ((coalitionSeats / totalSeats) * 100).toFixed(1) : "0.0"}%)</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors"
                  disabled={selected.size === 0}
                >
                  Clear selection
                </button>
              </div>

              <div className="relative h-5 w-full rounded-full bg-secondary overflow-hidden">
                {/* Stacked coalition segments */}
                <div className="absolute inset-y-0 left-0 flex">
                  {seatedParties
                    .filter((p) => selected.has(p.party_id))
                    .map((p) => {
                      const color = safeColor(p.color);
                      const w = totalSeats > 0 ? (p.seats / totalSeats) * 100 : 0;
                      return (
                        <div
                          key={p.party_id}
                          style={{
                            width: `${w}%`,
                            backgroundColor: color,
                            borderRight: `1px solid ${isNearWhite(color) ? "#cbd5e1" : "rgba(255,255,255,0.4)"}`,
                          }}
                          title={`${abbrMap.get(p.party_id) ?? p.party_name}: ${p.seats}`}
                        />
                      );
                    })}
                </div>
                {/* Threshold markers */}
                {totalSeats > 0 && (
                  <>
                    <ThresholdMarker pct={(absoluteNeeded / totalSeats) * 100} label="50%+1" />
                    <ThresholdMarker pct={(superNeeded / totalSeats) * 100} label="⅔" />
                  </>
                )}
              </div>
            </section>

            {/* Party list */}
            <section className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2 w-10"></th>
                    <th className="text-left font-medium px-2 py-2 w-8"></th>
                    <th className="text-left font-medium px-2 py-2">Party</th>
                    <th className="text-right font-medium px-3 py-2 w-20">Seats</th>
                    <th className="text-right font-medium px-3 py-2 w-20">% chamber</th>
                  </tr>
                </thead>
                <tbody>
                  {seatedParties.map((p) => {
                    const color = safeColor(p.color);
                    const isSel = selected.has(p.party_id);
                    const abbr = abbrMap.get(p.party_id);
                    return (
                      <tr
                        key={p.party_id}
                        className={`border-t border-border cursor-pointer transition-colors ${isSel ? "bg-secondary/60" : "hover:bg-secondary/30"}`}
                        onClick={() => toggle(p.party_id)}
                      >
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggle(p.party_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 accent-foreground cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className="inline-block h-4 w-4 rounded-sm"
                            style={{ backgroundColor: color, border: `1px solid ${borderForColor(color)}` }}
                          />
                        </td>
                        <td className="px-2 py-2 min-w-0">
                          <div className="flex items-baseline gap-2 min-w-0">
                            {abbr && <span className="font-semibold">{abbr}</span>}
                            <span className="text-muted-foreground text-xs truncate">{p.party_name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{p.seats}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {totalSeats > 0 ? ((p.seats / totalSeats) * 100).toFixed(1) : "0.0"}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <p className="text-xs text-muted-foreground">
              Based on the latest election dashboard. Click any row to add or remove that party from the coalition.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function ThresholdCard({
  label,
  desc,
  current,
  needed,
  pass,
  suffix,
}: {
  label: string;
  desc: string;
  current: number;
  needed: number;
  pass: boolean;
  suffix?: string;
}) {
  const deficit = needed - current;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
            pass ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
          }`}
        >
          {pass ? "✓ Met" : "✗ Short"}
        </span>
      </div>
      <div className="mt-3 text-lg font-bold tabular-nums">
        {current}
        <span className="text-sm font-normal text-muted-foreground"> / {needed}{suffix ?? ""}</span>
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        {pass ? `+${current - needed} over threshold` : `${deficit} seat${deficit === 1 ? "" : "s"} short`}
      </div>
    </div>
  );
}

function ThresholdMarker({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      className="absolute inset-y-0 pointer-events-none"
      style={{ left: `${pct}%` }}
    >
      <div className="h-full w-px bg-foreground/60" />
      <div className="absolute -top-4 left-1 text-[9px] text-muted-foreground whitespace-nowrap">{label}</div>
    </div>
  );
}
