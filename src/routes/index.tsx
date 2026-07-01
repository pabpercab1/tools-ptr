import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng, toJpeg } from "html-to-image";
import { ParliamentChart } from "@/components/ParliamentChart";
import { useNation } from "@/lib/nation-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Polling — PR:R Tools" },
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

function dHondt(
  parties: { id: number; votes: number }[],
  seats: number,
): Map<number, number> {
  const result = new Map<number, number>();
  for (const p of parties) result.set(p.id, 0);
  if (seats <= 0 || parties.length === 0) return result;
  const totalVotes = parties.reduce((s, p) => s + p.votes, 0);
  if (totalVotes <= 0) return result;
  for (let i = 0; i < seats; i++) {
    let bestId = parties[0].id;
    let bestQ = -1;
    for (const p of parties) {
      const q = p.votes / ((result.get(p.id) ?? 0) + 1);
      if (q > bestQ) {
        bestQ = q;
        bestId = p.id;
      }
    }
    result.set(bestId, (result.get(bestId) ?? 0) + 1);
  }
  return result;
}

function PollingTool() {
  const { nationId, selectedNation } = useNation();



  const [polls, setPolls] = useState<PollListItem[] | null>(null);
  const [pollsErr, setPollsErr] = useState<string | null>(null);
  const [pollsLoading, setPollsLoading] = useState(false);

  const [pollId, setPollId] = useState<number | null>(null);
  const [poll, setPoll] = useState<PollDetail | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [pollLoading, setPollLoading] = useState(false);

  const [mode, setMode] = useState<"poll" | "seats" | "estimate">("poll");
  const [showPrevious, setShowPrevious] = useState(true);

  const [estTotalSeats, setEstTotalSeats] = useState<number>(449);
  const [estThreshold, setEstThreshold] = useState<number>(3.0);
  


  // Timeline: cache of fetched poll details for current nation, for trend line
  const [timeline, setTimeline] = useState<PollDetail[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Party logos for the selected nation
  const [partyLogos, setPartyLogos] = useState<Map<number, string | null>>(new Map());

  // Government status per party: "govt" (cabinet member) or "supp" (confidence partner)
  const [govStatus, setGovStatus] = useState<Map<number, "govt" | "supp">>(new Map());

  // Chart export state
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [exportFormat, setExportFormat] = useState<"png" | "jpg">("png");
  const [exportLegend, setExportLegend] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);




  // Party logos when nation changes
  useEffect(() => {
    if (nationId == null) {
      setPartyLogos(new Map());
      return;
    }
    jget<Array<{ id: number; logo_url: string | null }>>(
      `/parties?nation_id=${nationId}&active_only=true`,
    )
      .then((d) => {
        const m = new Map<number, string | null>();
        for (const p of d) m.set(p.id, p.logo_url ?? null);
        setPartyLogos(m);
      })
      .catch(() => setPartyLogos(new Map()));
  }, [nationId]);

  // Government status when nation changes
  useEffect(() => {
    if (nationId == null) {
      setGovStatus(new Map());
      return;
    }
    jget<{
      members?: Array<{ party_id: number }>;
      confidence_partners?: Array<{ party_id: number }>;
    }>(`/nations/${nationId}/government`)
      .then((g) => {
        const m = new Map<number, "govt" | "supp">();
        for (const cp of g.confidence_partners ?? []) {
          if (cp?.party_id != null) m.set(cp.party_id, "supp");
        }
        for (const mem of g.members ?? []) {
          if (mem?.party_id != null) m.set(mem.party_id, "govt"); // govt overrides supp
        }
        setGovStatus(m);
      })
      .catch(() => setGovStatus(new Map()));
  }, [nationId]);


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

  // Election dashboard defaults for "Estimate parliament" mode
  useEffect(() => {
    if (nationId == null) return;
    jget<{ total_seats: number; threshold_pct: number }>(`/nations/${nationId}/elections/dashboard`)
      .then((d) => {
        if (typeof d.total_seats === "number") setEstTotalSeats(d.total_seats);
        if (typeof d.threshold_pct === "number") setEstThreshold(Math.round(d.threshold_pct));
      })
      .catch(() => {});
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

  

  // D'Hondt estimate based on current poll + user-set total seats & threshold
  const estimate = useMemo(() => {
    if (!poll) return null;
    const eligible = poll.parties.filter((p) => p.support_pct >= estThreshold);
    const seatMap = dHondt(
      eligible.map((p) => ({ id: p.party_id, votes: p.support_pct })),
      Math.max(0, Math.floor(estTotalSeats)),
    );
    return { seatMap, eligibleCount: eligible.length };
  }, [poll, estThreshold, estTotalSeats]);

  const rows = useMemo(() => {
    if (!poll) return [];
    const parties = poll.parties;
    if (mode === "poll") {
      return [...parties].sort((a, b) => b.support_pct - a.support_pct);
    }
    if (mode === "seats") {
      return [...parties].sort((a, b) => b.projected_seats - a.projected_seats);
    }
    // estimate: replace projected_seats with D'Hondt allocation
    const sm = estimate?.seatMap ?? new Map<number, number>();
    return parties
      .map((p) => ({ ...p, projected_seats: sm.get(p.party_id) ?? 0 }))
      .sort((a, b) => b.projected_seats - a.projected_seats);
  }, [poll, mode, estimate]);

  const effectiveTotalSeats =
    mode === "estimate" ? Math.max(1, Math.floor(estTotalSeats)) : poll?.total_seats ?? 0;
  const effectiveShowPrevious = mode === "estimate" ? false : showPrevious;

  const maxValue =
    mode === "poll"
      ? Math.max(
          50,
          ...rows.map((r) => r.support_pct),
          ...(showPrevious ? rows.map((r) => r.election_support_pct ?? 0) : []),
        )
      : effectiveTotalSeats > 0
        ? Math.max(
            50,
            ...rows.map((r) => ((r.projected_seats || 0) / effectiveTotalSeats) * 100),
            ...(effectiveShowPrevious
              ? rows.map((r) => ((r.election_seats ?? 0) / effectiveTotalSeats) * 100)
              : []),
          )
        : 50;

  const handleExport = async () => {
    const node = chartRef.current;
    if (!node || !poll) return;
    setExportBusy(true);
    const hidden: Array<{ el: HTMLElement; prev: string }> = [];
    if (!exportLegend) {
      node.querySelectorAll<HTMLElement>("[data-chart-legend]").forEach((el) => {
        hidden.push({ el, prev: el.style.display });
        el.style.display = "none";
      });
    }
    try {
      const opts = {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      };
      const dataUrl =
        exportFormat === "png"
          ? await toPng(node, opts)
          : await toJpeg(node, { ...opts, quality: 0.95 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `ptr-${slugify(selectedNation?.name ?? "nation")}-${poll.game_month}-${mode}.${exportFormat}`;
      a.click();
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      hidden.forEach(({ el, prev }) => {
        el.style.display = prev;
      });
      setExportBusy(false);
    }
  };



  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Polling</h1>
          <p className="text-sm text-muted-foreground">
            Visualise fictional election polls and compare with previous results.
          </p>
        </header>
        <section className="grid gap-4 md:grid-cols-1">


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
                {(["poll", "seats", "estimate"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                      mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "poll" ? "Voting intention" : m === "seats" ? "Projected seats" : "Estimate parliament"}
                  </button>
                ))}
              </div>
              {mode !== "estimate" && (
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-foreground cursor-pointer"
                    checked={showPrevious}
                    onChange={(e) => setShowPrevious(e.target.checked)}
                  />
                  Show previous election
                </label>
              )}
              {mode === "estimate" && (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-muted-foreground">Total seats</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={estTotalSeats}
                      onChange={(e) => setEstTotalSeats(Number(e.target.value) || 0)}
                      className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-muted-foreground">Threshold</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={estThreshold}
                      onChange={(e) => setEstThreshold(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-muted-foreground">%</span>
                  </label>
                </div>
              )}
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
                {selectedNation?.name} —{" "}
                {mode === "poll"
                  ? "Voting intention"
                  : mode === "seats"
                    ? "Projected seats"
                    : "Estimate parliament"}
              </h2>
              <span className="text-xs text-muted-foreground">{poll.game_month}</span>
            </div>
            {mode === "estimate" && (
              <p className="text-xs text-muted-foreground italic">
                Estimated seats based on current poll at {estThreshold}% threshold,{" "}
                {Math.max(1, Math.floor(estTotalSeats))} seats — not an official projection.
              </p>
            )}
            {mode === "estimate" && estimate && estimate.eligibleCount === 0 ? (
              <EmptyState message="No party would win seats — every party is below the threshold." />
            ) : (
              <div ref={chartRef} className="bg-card">
                {mode === "estimate" ? (
                  <ParliamentChart
                    seats={rows.map((r) => ({
                      partyId: r.party_id,
                      abbr: r.abbreviation,
                      name: r.party_name,
                      color: safeColor(r.color),
                      seats: r.projected_seats,
                    }))}
                    totalSeats={effectiveTotalSeats}
                  />
                ) : (
                  <BarChart
                    rows={rows}
                    mode={mode as "poll" | "seats"}
                    maxValue={maxValue}
                    totalSeats={effectiveTotalSeats}
                    showPrevious={effectiveShowPrevious}
                    govStatus={govStatus}
                  />
                )}
              </div>
            )}


            <div>
              <h2 className="text-sm font-semibold mb-3">Detail</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-muted-foreground text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-medium px-3 py-2"></th>
                      <th className="text-left font-medium px-3 py-2">Party</th>
                      <th className="text-right font-medium px-3 py-2">Support</th>
                      <th className="text-right font-medium px-3 py-2">Δ vs prior poll</th>
                      <th className="text-right font-medium px-3 py-2">Δ vs election</th>
                      <th className="text-right font-medium px-3 py-2">Seats</th>
                      <th className="text-right font-medium px-3 py-2">Δ seats vs election</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const dPrior = p.prior_support_pct != null ? p.support_pct - p.prior_support_pct : null;
                      const dElecPct = p.election_support_pct != null ? p.support_pct - p.election_support_pct : null;
                      const dElec = p.election_seats != null ? p.projected_seats - p.election_seats : null;
                      return (
                        <tr key={p.party_id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <div
                              className="h-5 w-5 rounded-[3px] flex items-center justify-center overflow-hidden shrink-0 p-0.5"
                              style={{
                                backgroundColor: safeColor(p.color),
                                border: `1.5px solid ${borderForColor(safeColor(p.color))}`,
                              }}
                            >
                              {partyLogos.get(p.party_id) ? (
                                <img
                                  src={partyLogos.get(p.party_id) as string}
                                  alt=""
                                  className="h-full w-full object-contain"
                                />
                              ) : null}
                            </div>
                          </td>

                          <td className="px-3 py-2">
                            <div className="font-medium">{p.abbreviation}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[18rem]">{p.party_name}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtPct(p.support_pct)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {dPrior == null ? <span className="text-muted-foreground">—</span> : <DeltaPct v={dPrior} />}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {dElecPct == null ? <span className="text-muted-foreground">—</span> : <DeltaPct v={dElecPct} />}
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
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted-foreground flex items-center justify-between gap-4">
          <span>Data: api.ptr.zanz2.dev</span>
          {poll && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-foreground cursor-pointer"
                  checked={exportLegend}
                  onChange={(e) => setExportLegend(e.target.checked)}
                />
                Include legend
              </label>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                {(["png", "jpg"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setExportFormat(f)}
                    className={`px-2 py-1 uppercase tracking-wide ${
                      exportFormat === f
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={exportBusy}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary transition-colors disabled:opacity-50"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {exportBusy ? "Exporting…" : "Export chart"}
              </button>
            </div>
          )}
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

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "nation";
}

function EmptyState({ message, tone }: { message: string; tone?: "error" }) {
  return (
    <div className={`rounded-lg border border-dashed border-border p-10 text-center text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      {message}
    </div>
  );
}

function mixWithWhite(hex: string, t: number) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function BarChart({
  rows,
  mode,
  maxValue,
  totalSeats,
  showPrevious,
  govStatus,
}: {
  rows: PollParty[];
  mode: "poll" | "seats";
  maxValue: number;
  totalSeats: number;
  showPrevious: boolean;
  govStatus: Map<number, "govt" | "supp">;
}) {
  const top = Math.max(10, Math.ceil(maxValue / 10) * 10);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);
  const chartH = 280;
  const axisW = 36;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {/* Legend */}
      <div
        data-chart-legend
        className="flex justify-end items-center gap-4 mb-3 text-[10px] text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-700" />
          Latest poll
        </span>
        {showPrevious && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
            Previous election
          </span>
        )}
      </div>

      <div className="relative" style={{ paddingLeft: axisW }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0" style={{ width: axisW, height: chartH }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {t}%
            </div>
          ))}
        </div>

        {/* Plot area */}
        <div className="relative" style={{ height: chartH }}>
          {/* Gridlines */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute left-0 right-0 border-t"
              style={{ bottom: `${(t / top) * 100}%`, borderColor: "var(--grid)" }}
            />
          ))}

          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-2 px-1">
            {rows.map((p) => {
              const value =
                mode === "poll"
                  ? p.support_pct
                  : totalSeats > 0
                    ? (p.projected_seats / totalSeats) * 100
                    : 0;
              const prevRaw =
                mode === "poll"
                  ? p.election_support_pct
                  : p.election_seats != null && totalSeats > 0
                    ? (p.election_seats / totalSeats) * 100
                    : null;
              const curHpct = (value / top) * 100;
              const prevHpct = prevRaw != null ? (prevRaw / top) * 100 : 0;
              const color = safeColor(p.color);
              const light = mixWithWhite(color, 0.6);
              const display = mode === "poll" ? fmtPct(value) : `${p.projected_seats}`;
              const prevDisplay =
                prevRaw == null
                  ? null
                  : mode === "poll"
                    ? fmtPct(prevRaw)
                    : `${p.election_seats}`;

              return (
                <div key={p.party_id} className="flex-1 min-w-0 h-full relative">
                  {/* Previous bar (lighter, thinner, offset behind/right) */}
                  {showPrevious && prevRaw != null && prevRaw > 0 && (
                    <div
                      className="absolute bottom-0 rounded-t-sm"
                      style={{
                        height: `${prevHpct}%`,
                        left: "52%",
                        right: "10%",
                        backgroundColor: light,
                        border: `1px solid ${borderForColor(light)}`,
                      }}
                    >
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 italic text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                        {prevDisplay}
                      </span>
                    </div>
                  )}
                  {/* Current bar (main) */}
                  {value > 0 && (
                    <div
                      className="absolute bottom-0 rounded-t-sm transition-[height] duration-300"
                      style={{
                        height: `${curHpct}%`,
                        left: "10%",
                        right: showPrevious && prevRaw != null ? "48%" : "10%",
                        backgroundColor: color,
                        border: `1px solid ${borderForColor(color)}`,
                      }}
                    >
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-bold text-[10px] tabular-nums whitespace-nowrap text-foreground">
                        {display}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* X-axis party labels */}
        <div className="flex gap-2 px-1 mt-2">
          {rows.map((p) => {
            const color = safeColor(p.color);
            const status = govStatus.get(p.party_id);
            return (
              <div
                key={p.party_id}
                className="flex-1 min-w-0 flex flex-col items-center gap-0.5"
              >
                <span
                  className="h-1 w-6 rounded-full"
                  style={{ backgroundColor: color, boxShadow: isNearWhite(color) ? "inset 0 0 0 1px #cbd5e1" : undefined }}
                />
                <span className="text-[10px] font-medium truncate max-w-full">
                  {p.abbreviation}
                </span>
                {status && (
                  <span
                    className="text-[8px] uppercase tracking-wider font-semibold leading-none"
                    style={{ color: status === "govt" ? "#334155" : "#64748b" }}
                    title={status === "govt" ? "In government" : "Confidence & supply partner"}
                  >
                    {status === "govt" ? "Govt" : "Supp"}
                  </span>
                )}
              </div>
            );
          })}
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
            const nearWhite = isNearWhite(info.color);
            return (
              <g key={pid}>
                {nearWhite && (
                  <polyline points={pts} fill="none" stroke="#cbd5e1" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
                )}
                <polyline points={pts} fill="none" stroke={info.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {polls.map((s, i) => {
                  const pp = s.parties.find((x) => x.party_id === pid);
                  if (!pp) return null;
                  return <circle key={i} cx={xPos(i)} cy={yPos(pp.support_pct)} r={2.5} fill={info.color} stroke={nearWhite ? "#94a3b8" : "none"} strokeWidth={nearWhite ? 0.75 : 0} />;
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
