import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng, toJpeg } from "html-to-image";
import { EmptyState } from "@/components/EmptyState";
import { ParliamentChart } from "@/components/ParliamentChart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNation } from "@/lib/nation-context";

export const Route = createFileRoute("/polls")({
  head: () => ({
    meta: [
      { title: "Polling - PR:R Tools" },
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

type ComparisonMode = "none" | "previous-election" | "previous-poll";

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

function formatGameMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month] = match;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function comparisonLabel(mode: ComparisonMode) {
  if (mode === "previous-election") return "Previous election";
  if (mode === "previous-poll") return "Previous poll";
  return "";
}

function comparisonSeatCount(
  party: PollParty,
  mode: ComparisonMode,
  priorPollSeatMap: Map<number, number>,
) {
  if (mode === "none") return null;
  if (mode === "previous-election") return party.election_seats;
  if (party.prior_support_pct == null) return null;
  return priorPollSeatMap.get(party.party_id) ?? 0;
}

function comparisonValue(
  party: PollParty,
  viewMode: "poll" | "seats",
  mode: ComparisonMode,
  totalSeats: number,
  priorPollSeatMap: Map<number, number>,
) {
  if (mode === "none") return null;
  if (viewMode === "poll") {
    return mode === "previous-election" ? party.election_support_pct : party.prior_support_pct;
  }
  const seats = comparisonSeatCount(party, mode, priorPollSeatMap);
  return seats != null && totalSeats > 0 ? (seats / totalSeats) * 100 : null;
}

function comparisonDisplay(
  party: PollParty,
  viewMode: "poll" | "seats",
  mode: ComparisonMode,
  priorPollSeatMap: Map<number, number>,
) {
  if (mode === "none") return null;
  if (viewMode === "poll") {
    const value = mode === "previous-election" ? party.election_support_pct : party.prior_support_pct;
    return value == null ? null : fmtPct(value);
  }
  const seats = comparisonSeatCount(party, mode, priorPollSeatMap);
  return seats == null ? null : `${seats}`;
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
  const [forceSeatThreshold, setForceSeatThreshold] = useState(false);
  const [poll, setPoll] = useState<PollDetail | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [pollLoading, setPollLoading] = useState(false);

  const [mode, setMode] = useState<"poll" | "seats" | "estimate">("poll");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("previous-election");

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
  const [exportMeta, setExportMeta] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [hiddenPartyIds, setHiddenPartyIds] = useState<number[]>([]);

  const selectedPollListItem = polls?.find((item) => item.id === pollId) ?? null;




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
    setHiddenPartyIds([]);
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

  // Election dashboard defaults for "Projected parliament" mode
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
    // Guard: only fetch if pollId belongs to the current nation's polls list.
    // Prevents a stale pollId from a previously-selected nation triggering a 404.
    if (!polls || !polls.some((p) => p.id === pollId)) return;
    let cancelled = false;
    setPollLoading(true);
    setPollErr(null);
    jget<PollDetail>(`/nations/${nationId}/polls/${pollId}`)
      .then((d) => {
        if (cancelled) return;
        setPoll(d);
        setPollLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setPollErr(String(e.message || e));
        setPollLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nationId, pollId, polls]);

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

  const projectedSeatMap = useMemo(() => {
    if (!poll) return new Map<number, number>();
    const eligible = forceSeatThreshold
      ? poll.parties.filter((party) => party.support_pct >= estThreshold)
      : poll.parties;
    return dHondt(
      eligible.map((party) => ({ id: party.party_id, votes: party.support_pct })),
      Math.max(0, poll.total_seats),
    );
  }, [poll, estThreshold, forceSeatThreshold]);

  const priorPollSeatMap = useMemo(() => {
    if (!poll) return new Map<number, number>();
    const eligible = poll.parties.filter(
      (party) =>
        party.prior_support_pct != null &&
        (!forceSeatThreshold || party.prior_support_pct >= estThreshold),
    );
    return dHondt(
      eligible.map((party) => ({ id: party.party_id, votes: party.prior_support_pct ?? 0 })),
      Math.max(0, poll.total_seats),
    );
  }, [poll, estThreshold, forceSeatThreshold]);

  const rows = useMemo(() => {
    if (!poll) return [];
    const parties = poll.parties;
    if (mode === "poll") {
      return [...parties].sort((a, b) => b.support_pct - a.support_pct);
    }
    if (mode === "seats") {
      return parties
        .map((party) => ({
          ...party,
          projected_seats: forceSeatThreshold
            ? projectedSeatMap.get(party.party_id) ?? 0
            : party.projected_seats,
        }))
        .sort((a, b) => b.projected_seats - a.projected_seats);
    }
    // estimate: replace projected_seats with D'Hondt allocation
    const sm = estimate?.seatMap ?? new Map<number, number>();
    return parties
      .map((p) => ({ ...p, projected_seats: sm.get(p.party_id) ?? 0 }))
      .sort((a, b) => b.projected_seats - a.projected_seats);
  }, [poll, mode, estimate, forceSeatThreshold, projectedSeatMap]);

  useEffect(() => {
    if (!poll) {
      setHiddenPartyIds([]);
      return;
    }
    const ids = new Set(poll.parties.map((p) => p.party_id));
    setHiddenPartyIds((current) => current.filter((id) => ids.has(id)));
  }, [poll]);

  const hiddenPartyIdSet = useMemo(() => new Set(hiddenPartyIds), [hiddenPartyIds]);

  const visibleRows = useMemo(
    () => rows.filter((r) => !hiddenPartyIdSet.has(r.party_id)),
    [rows, hiddenPartyIdSet],
  );

  const partyVisibilityRows = useMemo(() => {
    if (!poll) return [];
    return [...poll.parties].sort((a, b) => b.support_pct - a.support_pct);
  }, [poll]);

  const effectiveTotalSeats =
    mode === "estimate" ? Math.max(1, Math.floor(estTotalSeats)) : poll?.total_seats ?? 0;
  const effectiveComparisonMode = mode === "estimate" ? "none" : comparisonMode;

  const maxValue =
    mode === "poll"
      ? Math.max(
          50,
          ...visibleRows.map((r) => r.support_pct),
          ...(effectiveComparisonMode !== "none"
            ? visibleRows.map(
                (r) =>
                  comparisonValue(r, "poll", effectiveComparisonMode, effectiveTotalSeats, priorPollSeatMap) ?? 0,
              )
            : []),
        )
      : effectiveTotalSeats > 0
        ? Math.max(
            50,
            ...visibleRows.map((r) => ((r.projected_seats || 0) / effectiveTotalSeats) * 100),
            ...(effectiveComparisonMode !== "none"
              ? visibleRows.map(
                  (r) =>
                    comparisonValue(r, "seats", effectiveComparisonMode, effectiveTotalSeats, priorPollSeatMap) ?? 0,
                )
              : []),
          )
        : 50;

  const handleExport = async () => {
    const node = chartRef.current;
    if (!node || !poll) return;
    setExportBusy(true);
    const prevPadding = node.style.padding;
    const prevBoxSizing = node.style.boxSizing;
    const prevBackground = node.style.backgroundColor;
    const prevOverflow = node.style.overflow;
    // Add export-only whitespace so diagrams do not touch image edges.
    node.style.padding = "20px";
    node.style.boxSizing = "border-box";
    node.style.backgroundColor = "#ffffff";
    node.style.overflow = "hidden";
    const hidden: Array<{ el: HTMLElement; prev: string }> = [];
    const shown: Array<{ el: HTMLElement; prev: string }> = [];
    if (!exportLegend) {
      node.querySelectorAll<HTMLElement>("[data-chart-legend]").forEach((el) => {
        hidden.push({ el, prev: el.style.display });
        el.style.display = "none";
      });
    }
    node.querySelectorAll<HTMLElement>("[data-export-ignore]").forEach((el) => {
      hidden.push({ el, prev: el.style.display });
      el.style.display = "none";
    });
    if (exportMeta) {
      node.querySelectorAll<HTMLElement>("[data-export-meta]").forEach((el) => {
        shown.push({ el, prev: el.style.display });
        el.style.display = "block";
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
      shown.forEach(({ el, prev }) => {
        el.style.display = prev;
      });
      node.style.padding = prevPadding;
      node.style.boxSizing = prevBoxSizing;
      node.style.backgroundColor = prevBackground;
      node.style.overflow = prevOverflow;
      setExportBusy(false);
    }
  };



  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[88rem] px-4 py-6 space-y-8 sm:px-6 sm:py-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Polling</h1>
          <p className="text-sm text-muted-foreground">
            Visualise election polls, compare with previous results and create estimates.
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
              <Select
                value={pollId != null ? String(pollId) : ""}
                onValueChange={(value) => setPollId(value ? Number(value) : null)}
              >
                <SelectTrigger className="h-10 w-full bg-background text-sm">
                  {selectedPollListItem ? (
                    <div className="truncate">{formatGameMonth(selectedPollListItem.game_month)}</div>
                  ) : (
                    <SelectValue placeholder="Select poll" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {polls.map((p, index) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="flex w-full items-center justify-between gap-3 pr-5">
                        <span>{formatGameMonth(p.game_month)}</span>
                        {index === 0 ? (
                          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary">
                            LATEST
                          </span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </section>

        {poll && (
          <section className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="inline-flex w-full max-w-full rounded-md border border-border p-0.5 bg-secondary overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
                {(["poll", "seats", "estimate"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                      mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "poll" ? "Voting intention" : m === "seats" ? "Projected seats" : "Projected parliament"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {mode !== "estimate" && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Compare</span>
                    <Select
                      value={comparisonMode}
                      onValueChange={(value) => {
                        if (value) setComparisonMode(value as ComparisonMode);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[170px] bg-background px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Poll only</SelectItem>
                        <SelectItem value="previous-election">Previous election</SelectItem>
                        <SelectItem value="previous-poll">Previous poll</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {mode === "seats" && (
                  <label
                    className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none"
                    title="Uses the threshold value from the Projected parliament threshold input."
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-foreground cursor-pointer"
                      checked={forceSeatThreshold}
                      onChange={(e) => setForceSeatThreshold(e.target.checked)}
                    />
                    Force threshold
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
            </div>
            <div className="text-xs text-muted-foreground sm:text-right">
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
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {selectedNation?.name} -{" "}
                {mode === "poll"
                  ? "Voting intention"
                  : mode === "seats"
                    ? "Projected seats"
                    : "Projected parliament"}
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
                <div
                  data-export-meta
                  style={{ display: "none" }}
                  className="mb-3 border-b border-border px-1 pb-2"
                >
                  <div className="mb-0.5 flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground leading-tight">
                      {mode === "poll"
                        ? "Voting intention"
                        : mode === "seats"
                          ? "Projected seats"
                          : "Projected parliament"}
                    </div>
                    {selectedNation?.flagUrl ? (
                      <img
                        src={selectedNation.flagUrl}
                        alt={selectedNation?.name ? `Flag of ${selectedNation.name}` : "Country flag"}
                        className="h-8 w-auto rounded-[3px] border border-border object-contain bg-white shrink-0"
                      />
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground leading-tight">
                    {selectedNation?.name ?? "Unknown nation"} - {formatGameMonth(poll.game_month)}
                  </div>
                </div>
                {mode === "estimate" ? (
                  <ParliamentChart
                    seats={rows.map((r) => ({
                      partyId: r.party_id,
                      abbr: r.abbreviation,
                      name: r.party_name,
                      color: hiddenPartyIdSet.has(r.party_id) ? "#9ca3af" : safeColor(r.color),
                      seats: r.projected_seats,
                    }))}
                    totalSeats={effectiveTotalSeats}
                    hiddenPartyIds={hiddenPartyIds}
                  />
                ) : (
                  <BarChart
                    rows={visibleRows}
                    mode={mode as "poll" | "seats"}
                    maxValue={maxValue}
                    totalSeats={effectiveTotalSeats}
                    comparisonMode={effectiveComparisonMode}
                    priorPollSeatMap={priorPollSeatMap}
                    govStatus={govStatus}
                  />
                )}
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold mb-3">Detail</h2>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-[780px] w-full text-sm">
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
            {timeline.length > 1 && <TimelineChart polls={timeline} hiddenPartyIds={hiddenPartyIdSet} />}

          </section>
        )}

        {poll && partyVisibilityRows.length > 0 && (
          <section className="border-t border-border pt-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold">Party Visibility</h2>
              <span className="text-xs text-muted-foreground">
                Hide parties from charts and plots only
              </span>
            </div>
            <PartyVisibilityControls
              rows={partyVisibilityRows}
              hiddenPartyIds={hiddenPartyIdSet}
              onToggle={(partyId) =>
                setHiddenPartyIds((current) =>
                  current.includes(partyId)
                    ? current.filter((id) => id !== partyId)
                    : [...current, partyId],
                )
              }
              onShowAll={() => setHiddenPartyIds([])}
            />
          </section>
        )}
      </main>

      <footer className="mt-12 border-t border-border">
        <div className="mx-auto max-w-[88rem] px-4 py-4 text-xs text-muted-foreground flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Data: api.ptr.zanz2.dev</span>
          {poll && (
            <div className="flex w-full flex-wrap items-center justify-start gap-3 sm:w-auto sm:justify-end">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-foreground cursor-pointer"
                  checked={exportLegend}
                  onChange={(e) => setExportLegend(e.target.checked)}
                />
                Include legend
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-foreground cursor-pointer"
                  checked={exportMeta}
                  onChange={(e) => setExportMeta(e.target.checked)}
                />
                Include title/date/country
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
  comparisonMode,
  priorPollSeatMap,
  govStatus,
}: {
  rows: PollParty[];
  mode: "poll" | "seats";
  maxValue: number;
  totalSeats: number;
  comparisonMode: ComparisonMode;
  priorPollSeatMap: Map<number, number>;
  govStatus: Map<number, "govt" | "supp">;
}) {
  const hasComparison = comparisonMode !== "none";
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
        {hasComparison && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
            {comparisonLabel(comparisonMode)}
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
              const prevRaw = comparisonValue(
                p,
                mode,
                comparisonMode,
                totalSeats,
                priorPollSeatMap,
              );
              const curHpct = (value / top) * 100;
              const prevHpct = prevRaw != null ? (prevRaw / top) * 100 : 0;
              const color = safeColor(p.color);
              const light = mixWithWhite(color, 0.6);
              const display = mode === "poll" ? fmtPct(value) : `${p.projected_seats}`;
              const prevDisplay = comparisonDisplay(
                p,
                mode,
                comparisonMode,
                priorPollSeatMap,
              );

              return (
                <div key={p.party_id} className="flex-1 min-w-0 h-full relative">
                  {/* Previous bar (lighter, thinner, offset behind/right) */}
                  {hasComparison && prevRaw != null && prevRaw > 0 && (
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
                        right: hasComparison && prevRaw != null ? "48%" : "10%",
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


function TimelineChart({ polls, hiddenPartyIds }: { polls: PollDetail[]; hiddenPartyIds: Set<number> }) {
  const width = Math.max(760, polls.length * 72);
  const height = 320;
  const pad = { l: 56, r: 16, t: 12, b: 54 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    abbreviation: string;
    name: string;
    month: string;
    value: number;
    color: string;
  } | null>(null);

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

  const pollIndexStep = Math.max(1, Math.ceil((polls.length - 1) / 7));
  const shownXTickIdx = new Set<number>([0, polls.length - 1]);
  for (let i = 0; i < polls.length; i += pollIndexStep) {
    shownXTickIdx.add(i);
  }

  const trendMonthLabel = (value: string) => {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return value;
    const [, year, month] = match;
    const date = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(date);
  };

  const series = [...partyMap.entries()]
    .map(([pid, info]) => {
      const values: Array<number | null> = polls.map(
        (s) => s.parties.find((x) => x.party_id === pid)?.support_pct ?? null,
      );
      const latestValue = values[values.length - 1] ?? 0;
      const numericValues = values.filter((v): v is number => typeof v === "number");
      const maxValueSeen = numericValues.length > 0 ? Math.max(...numericValues) : 0;
      const points = values
        .map((v, i) => (v == null ? null : `${xPos(i)},${yPos(v)}`))
        .filter((v): v is string => v != null)
        .join(" ");
      return { pid, info, values, latestValue, maxValueSeen, points };
    })
    .filter((s) => !hiddenPartyIds.has(s.pid))
    .filter((s) => s.points.length > 0)
    .sort((a, b) => b.latestValue - a.latestValue || b.maxValueSeen - a.maxValueSeen);

  const maxVisibleSeries = 12;
  const visibleSeries = series.slice(0, maxVisibleSeries);
  const hiddenSeriesCount = Math.max(0, series.length - visibleSeries.length);
  const showPointMarkers = true;

  return (
    <div className="rounded-lg border border-border bg-card p-4 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto min-w-[520px]"
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <g transform={`translate(${pad.l},${pad.t})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={yPos(t)} y2={yPos(t)} stroke="var(--grid)" />
              <text x={-6} y={yPos(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="currentColor" className="text-muted-foreground">
                {t}%
              </text>
            </g>
          ))}

          {polls.map((s, i) =>
            shownXTickIdx.has(i) ? (
              <line key={`vx-${s.id}`} x1={xPos(i)} x2={xPos(i)} y1={0} y2={innerH} stroke="var(--grid)" />
            ) : null,
          )}

          {polls.map((s, i) => (
            shownXTickIdx.has(i) ? (
              <text
                key={s.id}
                x={xPos(i)}
                y={innerH + 16}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                className="text-muted-foreground"
              >
                {trendMonthLabel(s.game_month)}
              </text>
            ) : null
          ))}
          {visibleSeries.map(({ pid, info, values, points }, idx) => {
            const nearWhite = isNearWhite(info.color);
            const strokeWidth = idx < 4 ? 3.2 : 2.6;
            return (
              <g key={pid}>
                {nearWhite && (
                  <polyline points={points} fill="none" stroke="#cbd5e1" strokeWidth={Math.max(strokeWidth + 1.6, 4)} strokeLinejoin="round" strokeLinecap="round" />
                )}
                <polyline points={points} fill="none" stroke={info.color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
                {showPointMarkers && polls.map((s, i) => {
                  const v = values[i];
                  if (v == null) return null;
                  return (
                    <g key={i}>
                      {/* Larger invisible hit area so hover works reliably */}
                      <circle
                        cx={xPos(i)}
                        cy={yPos(v)}
                        r={7}
                        fill="transparent"
                        style={{ cursor: "default" }}
                        onMouseEnter={() =>
                          setHoveredPoint({
                            x: xPos(i),
                            y: yPos(v),
                            abbreviation: info.abbreviation,
                            name: info.name,
                            month: trendMonthLabel(s.game_month),
                            value: v,
                            color: info.color,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                      <circle
                        cx={xPos(i)}
                        cy={yPos(v)}
                        r={3.2}
                        fill="#ffffff"
                        fillOpacity={0.92}
                        stroke={nearWhite ? "#94a3b8" : "#ffffff"}
                        strokeWidth={nearWhite ? 0.85 : 0.95}
                      />
                      <circle
                        cx={xPos(i)}
                        cy={yPos(v)}
                        r={2.1}
                        fill={info.color}
                        stroke={nearWhite ? "#64748b" : "#ffffff"}
                        strokeWidth={nearWhite ? 0.65 : 0.8}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {hoveredPoint && (
            <g pointerEvents="none">
              <circle
                cx={Math.max(0, Math.min(innerW, hoveredPoint.x))}
                cy={Math.max(0, Math.min(innerH, hoveredPoint.y))}
                r={4.4}
                fill="none"
                stroke={hoveredPoint.color}
                strokeWidth={1.6}
                strokeOpacity={0.9}
              />
              <rect
                x={Math.max(0, Math.min(innerW - 162, hoveredPoint.x + 10))}
                y={Math.max(0, Math.min(innerH - 64, hoveredPoint.y - 58))}
                width={176}
                height={64}
                rx={8}
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth={1}
              />
              <circle
                cx={Math.max(0, Math.min(innerW - 176, hoveredPoint.x + 10)) + 11}
                cy={Math.max(0, Math.min(innerH - 64, hoveredPoint.y - 58)) + 24}
                r={4}
                fill={hoveredPoint.color}
                stroke="#ffffff"
                strokeWidth={0.8}
              />
              <text
                x={Math.max(0, Math.min(innerW - 176, hoveredPoint.x + 10)) + 8}
                y={Math.max(0, Math.min(innerH - 64, hoveredPoint.y - 58)) + 15}
                fontSize="10"
                fill="#64748b"
              >
                {hoveredPoint.month}
              </text>
              <text
                x={Math.max(0, Math.min(innerW - 176, hoveredPoint.x + 10)) + 20}
                y={Math.max(0, Math.min(innerH - 64, hoveredPoint.y - 58)) + 28}
                fontSize="11"
                fontWeight="700"
                fill="#0f172a"
              >
                {hoveredPoint.abbreviation} {fmtPct(hoveredPoint.value)}
              </text>
              <text
                x={Math.max(0, Math.min(innerW - 176, hoveredPoint.x + 10)) + 8}
                y={Math.max(0, Math.min(innerH - 64, hoveredPoint.y - 58)) + 46}
                fontSize="10"
                fill="#475569"
              >
                {hoveredPoint.name.length > 24 ? `${hoveredPoint.name.slice(0, 24)}…` : hoveredPoint.name}
              </text>
            </g>
          )}

          <text
            x={-42}
            y={innerH / 2}
            transform={`rotate(-90 -42 ${innerH / 2})`}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            className="text-muted-foreground"
          >
            Vote share (%)
          </text>

          <text
            x={innerW / 2}
            y={innerH + 40}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            className="text-muted-foreground"
          >
            Poll date
          </text>
        </g>
      </svg>
      {hiddenSeriesCount > 0 && (
        <div className="mt-1 px-1 text-[11px] text-muted-foreground">
          Showing top {visibleSeries.length} of {series.length} parties by latest support.
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 mt-3 px-1 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSeries.map(({ pid, info }) => (
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

function PartyVisibilityControls({
  rows,
  hiddenPartyIds,
  onToggle,
  onShowAll,
}: {
  rows: PollParty[];
  hiddenPartyIds: Set<number>;
  onToggle: (partyId: number) => void;
  onShowAll: () => void;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hide Parties In Charts And Plots
        </h3>
        <button
          type="button"
          onClick={onShowAll}
          className="h-7 px-2 rounded-md border border-border bg-background text-xs hover:bg-secondary"
        >
          Show all
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((party) => {
          const color = safeColor(party.color);
          const hidden = hiddenPartyIds.has(party.party_id);
          return (
            <label
              key={party.party_id}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs cursor-pointer"
            >
              <input
                type="checkbox"
                checked={hidden}
                onChange={() => onToggle(party.party_id)}
                className="h-3.5 w-3.5 accent-foreground"
              />
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color, boxShadow: isNearWhite(color) ? "inset 0 0 0 1px #94a3b8" : undefined }}
              />
              <span className="font-medium truncate">{party.abbreviation}</span>
              {hidden ? <span className="text-muted-foreground">hidden</span> : null}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        This only changes display in charts and plots. Calculations and seat distribution remain unchanged.
      </p>
    </div>
  );
}
