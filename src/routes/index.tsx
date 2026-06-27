import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PTR Tools — Polling Visualiser" },
      { name: "description", content: "EuropeElects-style poll graphics for fictional elections." },
    ],
  }),
  component: PollingTool,
});

const API = "/api/ptr";
const FALLBACK_COLOR = "#999999";

type Nation = { id: number; name: string };

type PollListItem = {
  id: number;
  dimension: string;
  game_month: string;
  election_id: number | null;
  created_at: string;
};

type PollParty = {
  party_id: number;
  party_name: string;
  abbreviation: string;
  color: string | null;
  support_pct: number;
  projected_seats: number;
  election_support_pct: number | null;
  election_seats: number | null;
  election_game_month: string | null;
  prior_support_pct: number | null;
  prior_game_month: string | null;
};

type PollDetail = {
  id: number;
  nation_id: number;
  dimension: string;
  game_month: string;
  parties: PollParty[];
  total_seats: number;
  allocation_method: string;
  margin_of_error: number | null;
  created_at: string;
};

function safeColor(c: string | null | undefined) {
  if (!c) return FALLBACK_COLOR;
  return /^#([0-9a-f]{3}){1,2}$/i.test(c) ? c : FALLBACK_COLOR;
}
function fmtPct(n: number) {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
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

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function PollingTool() {
  const [nations, setNations] = useState<Nation[] | null>(null);
  const [nationsErr, setNationsErr] = useState<string | null>(null);
  const [nationId, setNationId] = useState<number | null>(null);

  const [polls, setPolls] = useState<PollListItem[] | null>(null);
  const [pollsErr, setPollsErr] = useState<string | null>(null);
  const [pollsLoading, setPollsLoading] = useState(false);

  const [pollId, setPollId] = useState<number | null>(null);
  const [poll, setPoll] = useState<PollDetail | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [pollLoading, setPollLoading] = useState(false);

  const [mode, setMode] = useState<"poll" | "seats">("poll");
  const [showPrevious, setShowPrevious] = useState(true);

  // Timeline: cache of fetched poll details for current nation, for trend line
  const [timeline, setTimeline] = useState<PollDetail[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Nations
  useEffect(() => {
    jget<Nation[]>("/nations")
      .then((d) => {
        d.sort((a, b) => a.name.localeCompare(b.name));
        setNations(d);
      })
      .catch((e) => setNationsErr(String(e.message || e)));
  }, []);

  // Polls list when nation changes
  useEffect(() => {
    if (nationId == null) return;
    setPollsLoading(true);
    setPollsErr(null);
    setPolls(null);
    setPoll(null);
    setPollId(null);
    setTimeline([]);
    jget<{ items: PollListItem[] }>(`/nations/${nationId}/polls/national?offset=0&limit=20`)
      .then((d) => {
        const items = [...d.items].sort((a, b) => b.game_month.localeCompare(a.game_month));
        setPolls(items);
        setPollsLoading(false);
        if (items.length) setPollId(items[0].id);
      })
      .catch((e) => {
        setPollsErr(String(e.message || e));
        setPollsLoading(false);
      });
  }, [nationId]);

  // Selected poll detail
  useEffect(() => {
    if (nationId == null || pollId == null) return;
    setPollLoading(true);
    setPollErr(null);
    jget<PollDetail>(`/nations/${nationId}/polls/${pollId}`)
      .then((d) => {
        setPoll(d);
        setPollLoading(false);
      })
      .catch((e) => {
        setPollErr(String(e.message || e));
        setPollLoading(false);
      });
  }, [nationId, pollId]);

  // Fetch all polls for timeline (in parallel)
  useEffect(() => {
    if (nationId == null || !polls || polls.length === 0) return;
    let cancelled = false;
    setTimelineLoading(true);
    Promise.all(polls.map((p) => jget<PollDetail>(`/nations/${nationId}/polls/${p.id}`).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const ok = results.filter((r): r is PollDetail => !!r);
        ok.sort((a, b) => a.game_month.localeCompare(b.game_month));
        setTimeline(ok);
        setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nationId, polls]);

  const selectedNation = nations?.find((n) => n.id === nationId) ?? null;

  const rows = useMemo(() => {
    if (!poll) return [];
    return [...poll.parties].sort((a, b) =>
      mode === "poll" ? b.support_pct - a.support_pct : b.projected_seats - a.projected_seats,
    );
  }, [poll, mode]);

  const maxValue =
    mode === "poll"
      ? Math.max(50, ...rows.map((r) => r.support_pct))
      : poll && poll.total_seats > 0
        ? Math.max(
            50,
            ...rows.map((r) => ((r.projected_seats || 0) / poll.total_seats) * 100),
          )
        : 50;

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
        <section className="grid gap-4 md:grid-cols-2">
          <div>
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
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Poll
            </label>
            {nationId == null ? (
              <div className="text-sm text-muted-foreground">Select a nation first.</div>
            ) : pollsErr ? (
              <div className="text-sm text-destructive">Failed to load polls: {pollsErr}</div>
            ) : pollsLoading || !polls ? (
              <div className="text-sm text-muted-foreground">Loading polls…</div>
            ) : polls.length === 0 ? (
              <div className="text-sm text-muted-foreground">No polls available for this nation.</div>
            ) : (
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={pollId ?? ""}
                onChange={(e) => setPollId(e.target.value ? Number(e.target.value) : null)}
              >
                {polls.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.game_month} — #{p.id}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {poll && (
          <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-md border border-border p-0.5 bg-secondary">
                {(["poll", "seats"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                      mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "poll" ? "Voting intention" : "Projected seats"}
                  </button>
                ))}
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-foreground cursor-pointer"
                  checked={showPrevious}
                  onChange={(e) => setShowPrevious(e.target.checked)}
                />
                Show previous election
              </label>
            </div>
            <div className="text-xs text-muted-foreground">
              {poll.allocation_method} · {poll.total_seats} seats
              {poll.margin_of_error != null && <> · MoE ±{poll.margin_of_error}%</>}
            </div>
          </section>
        )}

        {nationId == null ? (
          <EmptyState message="Pick a nation to begin." />
        ) : pollLoading ? (
          <EmptyState message="Loading poll…" />
        ) : pollErr ? (
          <EmptyState message={`Failed to load poll: ${pollErr}`} tone="error" />
        ) : poll ? (
          <div className="space-y-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">
                {selectedNation?.name} — {mode === "poll" ? "Voting intention" : "Projected seats"}
              </h2>
              <span className="text-xs text-muted-foreground">{poll.game_month}</span>
            </div>
            <BarChart rows={rows} mode={mode} maxValue={maxValue} totalSeats={poll.total_seats} />

            <div>
              <h2 className="text-sm font-semibold mb-3">Detail</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-muted-foreground text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-medium px-3 py-2"></th>
                      <th className="text-left font-medium px-3 py-2">Party</th>
                      <th className="text-right font-medium px-3 py-2">Support</th>
                      <th className="text-right font-medium px-3 py-2">Δ vs prior</th>
                      <th className="text-right font-medium px-3 py-2">Seats</th>
                      <th className="text-right font-medium px-3 py-2">Δ vs election</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const dPrior = p.prior_support_pct != null ? p.support_pct - p.prior_support_pct : null;
                      const dElec = p.election_seats != null ? p.projected_seats - p.election_seats : null;
                      return (
                        <tr key={p.party_id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <span className="inline-block h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: safeColor(p.color) }} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{p.abbreviation}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[18rem]">{p.party_name}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtPct(p.support_pct)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {dPrior == null ? <span className="text-muted-foreground">—</span> : <DeltaPct v={dPrior} />}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{p.projected_seats}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {dElec == null ? <span className="text-muted-foreground">—</span> : <DeltaInt v={dElec} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {nationId != null && polls && polls.length > 1 && (
          <section className="border-t border-border pt-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold">Trend</h2>
              <span className="text-xs text-muted-foreground">
                {timelineLoading ? "Loading…" : `${timeline.length} polls`}
              </span>
            </div>
            {timeline.length > 1 && <TimelineChart polls={timeline} />}
          </section>
        )}
      </main>

      <footer className="mt-12 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted-foreground">
          Data: api.ptr.zanz2.dev
        </div>
      </footer>
    </div>
  );
}

function DeltaPct({ v }: { v: number }) {
  const r = Math.round(v * 10) / 10;
  const c = r > 0 ? "text-emerald-600" : r < 0 ? "text-rose-600" : "text-muted-foreground";
  const s = r > 0 ? "+" : "";
  return <span className={c}>{s}{r.toFixed(1)}</span>;
}
function DeltaInt({ v }: { v: number }) {
  const c = v > 0 ? "text-emerald-600" : v < 0 ? "text-rose-600" : "text-muted-foreground";
  const s = v > 0 ? "+" : "";
  return <span className={c}>{s}{v}</span>;
}

function EmptyState({ message, tone }: { message: string; tone?: "error" }) {
  return (
    <div className={`rounded-lg border border-dashed border-border p-10 text-center text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      {message}
    </div>
  );
}

function BarChart({
  rows,
  mode,
  maxValue,
  totalSeats,
}: {
  rows: PollParty[];
  mode: "poll" | "seats";
  maxValue: number;
  totalSeats: number;
}) {
  const top = Math.max(10, Math.ceil(maxValue / 10) * 10);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="relative">
        <div className="absolute inset-y-0 left-[5.5rem] right-0 pointer-events-none">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute top-0 bottom-6 border-l"
              style={{ left: `${(t / top) * 100}%`, borderColor: "var(--grid)" }}
            />
          ))}
        </div>

        <div className="space-y-2 relative">
          {rows.map((p) => {
            const value =
              mode === "poll"
                ? p.support_pct
                : totalSeats > 0
                  ? (p.projected_seats / totalSeats) * 100
                  : 0;
            const widthPct = (value / top) * 100;
            const color = safeColor(p.color);
            const display = mode === "poll" ? fmtPct(value) : `${p.projected_seats} seats`;
            return (
              <div key={p.party_id} className="flex items-center gap-2">
                <div className="w-4 flex justify-center shrink-0">
                  <span className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: color }} />
                </div>
                <div className="w-16 text-xs font-medium shrink-0">{p.abbreviation}</div>
                <div className="flex-1 h-7 relative">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-2.5 text-[11px] font-semibold transition-[width] duration-300"
                    style={{
                      width: `${Math.max(widthPct, value > 0 ? 2 : 0)}%`,
                      backgroundColor: color,
                      minWidth: value > 0 ? "2.75rem" : 0,
                      color: pickTextColor(color),
                    }}
                  >
                    {value > 0 && <span>{display}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative h-5 mt-2 ml-[5.5rem]">
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

function TimelineChart({ polls }: { polls: PollDetail[] }) {
  const width = 760;
  const height = 300;
  const pad = { l: 40, r: 16, t: 12, b: 36 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const partyMap = new Map<number, { abbreviation: string; color: string; name: string }>();
  for (const poll of polls) {
    for (const p of poll.parties) {
      if (!partyMap.has(p.party_id)) {
        partyMap.set(p.party_id, { abbreviation: p.abbreviation, color: safeColor(p.color), name: p.party_name });
      }
    }
  }

  const xPos = (i: number) => (polls.length <= 1 ? innerW / 2 : (i / (polls.length - 1)) * innerW);
  const maxY = Math.max(
    10,
    Math.ceil(Math.max(...polls.flatMap((s) => s.parties.map((p) => p.support_pct)), 0) / 10) * 10,
  );
  const yPos = (v: number) => innerH - (v / maxY) * innerH;
  const yTicks = Array.from({ length: maxY / 10 + 1 }, (_, i) => i * 10);

  return (
    <div className="rounded-lg border border-border bg-card p-4 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[520px]">
        <g transform={`translate(${pad.l},${pad.t})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={yPos(t)} y2={yPos(t)} stroke="var(--grid)" />
              <text x={-6} y={yPos(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="currentColor" className="text-muted-foreground">
                {t}%
              </text>
            </g>
          ))}
          {polls.map((s, i) => (
            <text
              key={s.id}
              x={xPos(i)}
              y={innerH + 16}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              className="text-muted-foreground"
            >
              {s.game_month}
            </text>
          ))}
          {[...partyMap.entries()].map(([pid, info]) => {
            const pts = polls
              .map((s, i) => {
                const pp = s.parties.find((x) => x.party_id === pid);
                return pp ? `${xPos(i)},${yPos(pp.support_pct)}` : null;
              })
              .filter(Boolean)
              .join(" ");
            return (
              <g key={pid}>
                <polyline points={pts} fill="none" stroke={info.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {polls.map((s, i) => {
                  const pp = s.parties.find((x) => x.party_id === pid);
                  if (!pp) return null;
                  return <circle key={i} cx={xPos(i)} cy={yPos(pp.support_pct)} r={2.5} fill={info.color} />;
                })}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-1">
        {[...partyMap.entries()].map(([pid, info]) => (
          <div key={pid} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ backgroundColor: info.color }} />
            <span className="font-medium">{info.abbreviation}</span>
            <span className="text-muted-foreground truncate max-w-[10rem]">{info.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
