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

  type Vote = "yes" | "abstain" | "no";
  const [votes, setVotes] = useState<Map<number, Vote>>(new Map());

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
    setVotes(new Map());
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

  const tally = useMemo(() => {
    let yes = 0, no = 0, abstain = 0;
    for (const p of seatedParties) {
      const v = votes.get(p.party_id);
      if (v === "yes") yes += p.seats;
      else if (v === "no") no += p.seats;
      else if (v === "abstain") abstain += p.seats;
    }
    const unassigned = totalSeats - yes - no - abstain;
    return { yes, no, abstain, unassigned };
  }, [seatedParties, votes, totalSeats]);

  const absoluteNeeded = Math.floor(totalSeats / 2) + 1;
  const superNeeded = Math.ceil((totalSeats * 2) / 3);

  const setVote = (id: number, v: Vote | null) =>
    setVotes((prev) => {
      const next = new Map(prev);
      if (v === null) next.delete(id);
      else next.set(id, v);
      return next;
    });

  const VOTE_COLORS: Record<Vote, string> = {
    yes: "#16a34a",
    abstain: "#94a3b8",
    no: "#dc2626",
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Majority Calculator</h1>
          <p className="text-sm text-muted-foreground">
            Cast each party's vote as Yes, Abstain or No and see which majority thresholds the motion clears.
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
                label="Simple majority"
                desc="More Yes votes than No votes"
                current={tally.yes}
                needed={tally.no + 1}
                pass={tally.yes > tally.no && tally.yes > 0}
                suffix={` (vs ${tally.no} No)`}
              />
              <ThresholdCard
                label="Absolute majority (50%+1)"
                desc={`${absoluteNeeded} Yes of ${totalSeats} seats`}
                current={tally.yes}
                needed={absoluteNeeded}
                pass={tally.yes >= absoluteNeeded}
              />
              <ThresholdCard
                label="Supermajority (⅔)"
                desc={`${superNeeded} Yes of ${totalSeats} seats`}
                current={tally.yes}
                needed={superNeeded}
                pass={tally.yes >= superNeeded}
              />
            </section>

            {/* Vote tally bar */}
            <section className="rounded-lg border border-border bg-card p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <TallyStat label="Yes" value={tally.yes} total={totalSeats} color={VOTE_COLORS.yes} />
                  <TallyStat label="Abstain" value={tally.abstain} total={totalSeats} color={VOTE_COLORS.abstain} />
                  <TallyStat label="No" value={tally.no} total={totalSeats} color={VOTE_COLORS.no} />
                  <TallyStat label="Unassigned" value={tally.unassigned} total={totalSeats} color="#e2e8f0" muted />
                </div>
                <button
                  type="button"
                  onClick={() => setVotes(new Map())}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors"
                  disabled={votes.size === 0}
                >
                  Clear votes
                </button>
              </div>

              <div className="relative h-5 w-full rounded-full bg-secondary overflow-hidden">
                <div className="absolute inset-0 flex">
                  {(["yes", "abstain", "no"] as const).map((v) => {
                    const seats = tally[v];
                    const w = totalSeats > 0 ? (seats / totalSeats) * 100 : 0;
                    if (w <= 0) return null;
                    return (
                      <div
                        key={v}
                        style={{ width: `${w}%`, backgroundColor: VOTE_COLORS[v] }}
                        title={`${v}: ${seats}`}
                      />
                    );
                  })}
                </div>
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
                    <th className="text-left font-medium px-2 py-2 w-8"></th>
                    <th className="text-left font-medium px-2 py-2">Party</th>
                    <th className="text-right font-medium px-3 py-2 w-20">Seats</th>
                    <th className="text-right font-medium px-3 py-2 w-20">% chamber</th>
                    <th className="text-center font-medium px-3 py-2 w-72">Vote</th>
                  </tr>
                </thead>
                <tbody>
                  {seatedParties.map((p) => {
                    const color = safeColor(p.color);
                    const abbr = abbrMap.get(p.party_id);
                    const v = votes.get(p.party_id);
                    return (
                      <tr key={p.party_id} className="border-t border-border">
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
                        <td className="px-3 py-2">
                          <div className="inline-flex w-full rounded-md border border-border overflow-hidden text-xs font-medium">
                            {(["yes", "abstain", "no"] as const).map((opt) => {
                              const active = v === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setVote(p.party_id, active ? null : opt)}
                                  className={`flex-1 px-2 py-1.5 capitalize transition-colors ${
                                    active ? "text-white" : "bg-background hover:bg-secondary text-foreground"
                                  }`}
                                  style={active ? { backgroundColor: VOTE_COLORS[opt] } : undefined}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <p className="text-xs text-muted-foreground">
              Based on the latest election dashboard. Click a Yes/Abstain/No button to cast that party's bloc vote; click the active option again to unassign.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function TallyStat({ label, value, total, color, muted }: { label: string; value: number; total: number; color: string; muted?: boolean }) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color, border: "1px solid rgba(0,0,0,0.08)" }} />
      <span className={`text-xs ${muted ? "text-muted-foreground" : ""}`}>
        <span className="font-semibold">{label}</span>{" "}
        <span className="tabular-nums">{value}</span>{" "}
        <span className="text-muted-foreground">({pct}%)</span>
      </span>
    </div>
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
