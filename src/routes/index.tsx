import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PTR Tools — Polling Visualiser" },
      { name: "description", content: "Create EuropeElects-style poll graphics for fictional elections." },
    ],
  }),
  component: PollingTool,
});

const API = "https://api.ptr.zanz2.dev/api";
const FALLBACK_COLOR = "#999999";

type Nation = {
  id: number;
  name: string;
  population?: number;
  eligible_voters?: number;
  continent?: string;
};

type Party = {
  id: number;
  name: string;
  abbreviation: string;
  color: string | null;
  logo_url: string | null;
  seat_count: number;
  vote_count: number;
};

type Snapshot = {
  id: string;
  nation_id: number;
  nation_name: string;
  label: string;
  date: string;
  source?: string;
  values: Record<number, number>; // partyId -> pct
  parties: { id: number; abbreviation: string; name: string; color: string }[];
};

const STORAGE_KEY = "ptr-tools.snapshots.v1";

function safeColor(c: string | null | undefined) {
  if (!c) return FALLBACK_COLOR;
  return /^#([0-9a-f]{3}){1,2}$/i.test(c) ? c : FALLBACK_COLOR;
}
function fmtPct(n: number) {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

function PollingTool() {
  const [nations, setNations] = useState<Nation[] | null>(null);
  const [nationsErr, setNationsErr] = useState<string | null>(null);
  const [nationId, setNationId] = useState<number | null>(null);

  const [parties, setParties] = useState<Party[] | null>(null);
  const [partiesLoading, setPartiesLoading] = useState(false);
  const [partiesErr, setPartiesErr] = useState<string | null>(null);

  const [polls, setPolls] = useState<Record<number, string>>({});
  const [mode, setMode] = useState<"poll" | "seats">("poll");
  const [pollDate, setPollDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<string>("");
  const [snapName, setSnapName] = useState<string>("");

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // Load nations
  useEffect(() => {
    fetch(`${API}/nations`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Nation[]) => {
        data.sort((a, b) => a.name.localeCompare(b.name));
        setNations(data);
      })
      .catch((e) => setNationsErr(String(e.message || e)));
  }, []);

  // Load snapshots
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSnapshots(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
    } catch {}
  }, [snapshots]);

  // Load parties when nation changes
  useEffect(() => {
    if (nationId == null) return;
    setPartiesLoading(true);
    setPartiesErr(null);
    setParties(null);
    setPolls({});
    fetch(`${API}/parties?nation_id=${nationId}&active_only=true`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Party[]) => {
        setParties(data);
        setPartiesLoading(false);
      })
      .catch((e) => {
        setPartiesErr(String(e.message || e));
        setPartiesLoading(false);
      });
  }, [nationId]);

  const selectedNation = nations?.find((n) => n.id === nationId) ?? null;

  // Build rows for chart
  const rows = useMemo(() => {
    if (!parties) return [];
    const totalSeats = parties.reduce((s, p) => s + (p.seat_count || 0), 0);
    return parties
      .map((p) => {
        const pct = parseFloat(polls[p.id] ?? "") || 0;
        const seatPct = totalSeats > 0 ? ((p.seat_count || 0) / totalSeats) * 100 : 0;
        return {
          party: p,
          pct,
          seatPct,
          seats: p.seat_count || 0,
        };
      })
      .sort((a, b) => (mode === "poll" ? b.pct - a.pct : b.seats - a.seats));
  }, [parties, polls, mode]);

  const totalEntered = useMemo(
    () => Object.values(polls).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [polls],
  );

  const maxValue = mode === "poll" ? Math.max(50, ...rows.map((r) => r.pct)) : Math.max(...rows.map((r) => r.seatPct), 50);

  function saveSnapshot() {
    if (!parties || !selectedNation) return;
    const label = snapName.trim() || `Poll ${pollDate}`;
    const values: Record<number, number> = {};
    for (const p of parties) values[p.id] = parseFloat(polls[p.id] ?? "") || 0;
    const snap: Snapshot = {
      id: `${Date.now()}`,
      nation_id: selectedNation.id,
      nation_name: selectedNation.name,
      label,
      date: pollDate,
      source: source.trim() || undefined,
      values,
      parties: parties.map((p) => ({ id: p.id, abbreviation: p.abbreviation, name: p.name, color: safeColor(p.color) })),
    };
    setSnapshots((s) => [...s, snap]);
    setSnapName("");
  }

  function deleteSnapshot(id: string) {
    setSnapshots((s) => s.filter((x) => x.id !== id));
  }

  const nationSnapshots = snapshots
    .filter((s) => s.nation_id === nationId)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">PTR Tools</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Fictional election polling visualiser</p>
          </div>
          <nav className="text-xs text-muted-foreground">Polling</nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Controls */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Nation
            </label>
            {nationsErr ? (
              <div className="text-sm text-destructive">Failed to load nations: {nationsErr}</div>
            ) : !nations ? (
              <div className="text-sm text-muted-foreground">Loading nations…</div>
            ) : (
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={nationId ?? ""}
                onChange={(e) => setNationId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select a nation…</option>
                {nations.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Poll date
            </label>
            <input
              type="date"
              value={pollDate}
              onChange={(e) => setPollDate(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Sample size / source
            </label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. n=1,500 — PTR Polling"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </section>

        {/* Mode toggle */}
        {parties && parties.length > 0 && (
          <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-md border border-border p-0.5 bg-secondary">
              {(["poll", "seats"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                    mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "poll" ? "Poll %" : "Current seats"}
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              {mode === "poll" ? (
                <>
                  Total entered: <span className={`font-medium ${Math.abs(totalEntered - 100) < 0.05 ? "text-foreground" : "text-foreground"}`}>{totalEntered.toFixed(1)}%</span>
                </>
              ) : (
                <>Reference view from API</>
              )}
            </div>
          </section>
        )}

        {/* Party table + chart */}
        {nationId == null ? (
          <EmptyState message="Pick a nation to begin building a poll." />
        ) : partiesLoading ? (
          <EmptyState message="Loading parties…" />
        ) : partiesErr ? (
          <EmptyState message={`Failed to load parties: ${partiesErr}`} tone="error" />
        ) : parties && parties.length === 0 ? (
          <EmptyState message="This nation has no active parties." />
        ) : parties ? (
          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <h2 className="text-sm font-semibold mb-3">Parties</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-muted-foreground text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-medium px-3 py-2"></th>
                      <th className="text-left font-medium px-3 py-2">Party</th>
                      <th className="text-right font-medium px-3 py-2">Seats</th>
                      <th className="text-right font-medium px-3 py-2 w-24">Poll %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parties.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: safeColor(p.color) }} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{p.abbreviation}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[14rem]">{p.name}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{p.seat_count}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={polls[p.id] ?? ""}
                            onChange={(e) => setPolls((s) => ({ ...s, [p.id]: e.target.value }))}
                            className="w-20 h-8 rounded border border-input bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="0.0"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold">
                  {selectedNation?.name} — {mode === "poll" ? "Voting intention" : "Current seats"}
                </h2>
                <span className="text-xs text-muted-foreground">{pollDate}</span>
              </div>
              <BarChart rows={rows} mode={mode} maxValue={maxValue} />
              {source && <p className="mt-3 text-xs text-muted-foreground">{source}</p>}
            </div>
          </div>
        ) : null}

        {/* Snapshots */}
        {parties && parties.length > 0 && (
          <section className="border-t border-border pt-8">
            <div className="flex flex-wrap items-end gap-3 justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Saved snapshots</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Build a polling timeline for {selectedNation?.name}.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  type="text"
                  value={snapName}
                  onChange={(e) => setSnapName(e.target.value)}
                  placeholder="Snapshot name (optional)"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={saveSnapshot}
                  className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Save snapshot
                </button>
              </div>
            </div>

            {nationSnapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground">No snapshots yet for this nation.</p>
            ) : (
              <>
                <TimelineChart snapshots={nationSnapshots} />
                <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
                  {nationSnapshots.map((s) => (
                    <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.date}
                          {s.source ? ` · ${s.source}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteSnapshot(s.id)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </main>

      <footer className="mt-12 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted-foreground">
          Data: api.ptr.zanz2.dev · Snapshots saved locally in your browser.
        </div>
      </footer>
    </div>
  );
}

function EmptyState({ message, tone }: { message: string; tone?: "error" }) {
  return (
    <div
      className={`rounded-lg border border-dashed border-border p-10 text-center text-sm ${
        tone === "error" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {message}
    </div>
  );
}

type Row = {
  party: Party;
  pct: number;
  seatPct: number;
  seats: number;
};

function BarChart({ rows, mode, maxValue }: { rows: Row[]; mode: "poll" | "seats"; maxValue: number }) {
  // gridlines every 10 up to ceil(max/10)*10
  const top = Math.max(10, Math.ceil(maxValue / 10) * 10);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="relative">
        {/* gridlines */}
        <div className="absolute inset-y-0 left-[6.5rem] right-0 pointer-events-none">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute top-0 bottom-6 border-l"
              style={{ left: `${(t / top) * 100}%`, borderColor: "var(--grid)" }}
            />
          ))}
        </div>

        <div className="space-y-2 relative">
          {rows.map((r) => {
            const value = mode === "poll" ? r.pct : r.seatPct;
            const widthPct = (value / top) * 100;
            const color = safeColor(r.party.color);
            const display = mode === "poll" ? fmtPct(value) : `${r.seats} seats`;
            return (
              <div key={r.party.id} className="flex items-center gap-2">
                <div className="w-6 flex justify-center shrink-0">
                  {r.party.logo_url ? (
                    <img
                      src={r.party.logo_url}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover border border-border bg-white"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                  )}
                </div>
                <div className="w-16 text-xs font-medium text-foreground shrink-0">{r.party.abbreviation}</div>
                <div className="flex-1 h-7 relative">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-2.5 text-[11px] font-semibold text-white transition-[width] duration-300"
                    style={{
                      width: `${Math.max(widthPct, value > 0 ? 2 : 0)}%`,
                      backgroundColor: color,
                      minWidth: value > 0 ? "2.5rem" : 0,
                    }}
                  >
                    {value > 0 && <span style={{ color: pickTextColor(color) }}>{display}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* axis */}
        <div className="relative h-5 mt-2 ml-[6.5rem]">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ left: `${(t / top) * 100}%` }}
            >
              {t}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function pickTextColor(hex: string) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.65 ? "#1a1a1a" : "#ffffff";
}

function TimelineChart({ snapshots }: { snapshots: Snapshot[] }) {
  const width = 720;
  const height = 280;
  const pad = { l: 36, r: 16, t: 12, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  // collect unique parties across snapshots
  const partyMap = new Map<number, { abbreviation: string; color: string; name: string }>();
  for (const s of snapshots) for (const p of s.parties) if (!partyMap.has(p.id)) partyMap.set(p.id, p);

  const dates = snapshots.map((s) => s.date);
  const xPos = (i: number) => (snapshots.length <= 1 ? innerW / 2 : (i / (snapshots.length - 1)) * innerW);

  const maxY = Math.max(
    10,
    Math.ceil(
      Math.max(
        ...snapshots.flatMap((s) => Object.values(s.values)),
        0,
      ) / 10,
    ) * 10,
  );
  const yPos = (v: number) => innerH - (v / maxY) * innerH;

  const yTicks = Array.from({ length: maxY / 10 + 1 }, (_, i) => i * 10);

  return (
    <div className="rounded-lg border border-border bg-card p-4 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[480px]">
        <g transform={`translate(${pad.l},${pad.t})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={yPos(t)} y2={yPos(t)} stroke="var(--grid)" />
              <text x={-6} y={yPos(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
                {t}%
              </text>
            </g>
          ))}
          {dates.map((d, i) => (
            <text key={i} x={xPos(i)} y={innerH + 16} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
              {d}
            </text>
          ))}
          {[...partyMap.entries()].map(([pid, info]) => {
            const pts = snapshots.map((s, i) => `${xPos(i)},${yPos(s.values[pid] ?? 0)}`).join(" ");
            return (
              <g key={pid}>
                <polyline points={pts} fill="none" stroke={info.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {snapshots.map((s, i) => (
                  <circle key={i} cx={xPos(i)} cy={yPos(s.values[pid] ?? 0)} r={2.5} fill={info.color} />
                ))}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-1">
        {[...partyMap.entries()].map(([pid, info]) => (
          <div key={pid} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: info.color }} />
            <span className="font-medium">{info.abbreviation}</span>
            <span className="text-muted-foreground truncate max-w-[10rem]">{info.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
