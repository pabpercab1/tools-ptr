import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toJpeg, toPng } from "html-to-image";
import { EmptyState } from "@/components/EmptyState";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useNation } from "@/lib/nation-context";
import { usePtrAuth } from "@/lib/ptr-auth";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/party-primary")({
  head: () => ({
    meta: [
      { title: "Party Primary - PR:R Tools" },
      {
        name: "description",
        content:
          "Build internal party election scenarios with turnout, factions, absolute-majority thresholds, and exportable charts.",
      },
    ],
  }),
  component: PartyPrimaryTool,
});

const API = "/api/ptr";
const FALLBACK_COLOR = "#7c8798";

type ElectionType = "leadership" | "internal-role";
type ChartMode = "candidates" | "factions";

type Party = {
  id: number;
  name: string;
  abbreviation: string;
  color: string | null;
  logo_url: string | null;
  nation_id?: number;
};

type Position = {
  id: number;
  title: string;
  display_order: number;
};

type Figure = {
  id: number;
  name?: string;
  full_name?: string;
  charisma?: number;
};

type Candidate = {
  id: string;
  name: string;
  factionId: string | null;
  basePoints: number;
};

type Faction = {
  id: string;
  name: string;
  color: string;
  turnoutBoostPct: number;
};

type Bloc = {
  id: string;
  name: string;
  candidateId: string | null;
  weightPoints: number;
};

type CandidateResult = {
  candidate: Candidate;
  votes: number;
  sharePct: number;
};

type ComputedResult = {
  totalBallots: number;
  validBallots: number;
  spoiledBallots: number;
  winnerCandidateId: string | null;
  secondRoundRequired: boolean;
  candidates: CandidateResult[];
  factions: Array<{ factionId: string | null; label: string; votes: number; sharePct: number }>;
  warnings: string[];
};

type RoundSnapshot = {
  candidates: Candidate[];
  factions: Faction[];
  blocs: Bloc[];
};

type ScenarioData = {
  version: number;
  nationId: number | null;
  partyId: number | null;
  electionType: ElectionType;
  roleTitle: string;
  pollMonth: string;
  pollYear: number;
  absoluteMajority: boolean;
  secondRoundPrepared: boolean;
  chartMode: ChartMode;
  partyMembership: number;
  turnoutPct: number;
  spoiledPct: number;
  secondRoundKeepCount: number;
  currentRound?: number;
  maxRoundReached?: number;
  roundSnapshots?: Record<string, RoundSnapshot>;
  candidates: Candidate[];
  factions: Faction[];
  blocs: Bloc[];
};

type LatestPollListResponse = {
  items?: Array<{ game_month?: string }>;
};

const defaultFactions: Faction[] = [
  { id: "continuity", name: "Continuity", color: "#2563eb", turnoutBoostPct: 0 },
  { id: "reform", name: "Reform", color: "#059669", turnoutBoostPct: 0 },
];

const POLL_MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

function PartyPrimaryTool() {
  const { selectedNation } = useNation();
  const { session, authFetch } = usePtrAuth();
  const defaultPollDate = useMemo(() => getDefaultPollDate(), []);

  const [partyList, setPartyList] = useState<Party[] | null>(null);
  const [partyLoading, setPartyLoading] = useState(false);
  const [partyErr, setPartyErr] = useState<string | null>(null);

  const [partyId, setPartyId] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [figures, setFigures] = useState<Figure[]>([]);

  const [electionType, setElectionType] = useState<ElectionType>("leadership");
  const [roleTitle, setRoleTitle] = useState("President");
  const [absoluteMajority, setAbsoluteMajority] = useState(false);
  const [secondRoundPrepared, setSecondRoundPrepared] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRoundReached, setMaxRoundReached] = useState(1);
  const [chartMode, setChartMode] = useState<ChartMode>("candidates");

  const [partyMembership, setPartyMembership] = useState(50000);
  const [turnoutPct, setTurnoutPct] = useState(62);
  const [spoiledPct, setSpoiledPct] = useState(1);
  const [pollMonth, setPollMonth] = useState(defaultPollDate.month);
  const [pollYear, setPollYear] = useState(defaultPollDate.year);

  const [candidates, setCandidates] = useState<Candidate[]>([
    { id: uid("cand"), name: "Candidate A", factionId: "continuity", basePoints: 42 },
    { id: uid("cand"), name: "Candidate B", factionId: "reform", basePoints: 35 },
    { id: uid("cand"), name: "Candidate C", factionId: null, basePoints: 17 },
  ]);
  const [factions, setFactions] = useState<Faction[]>(defaultFactions);
  const [blocs, setBlocs] = useState<Bloc[]>([
    { id: uid("bloc"), name: "Youth wing", candidateId: null, weightPoints: 4 },
    { id: uid("bloc"), name: "Regional delegates", candidateId: null, weightPoints: 6 },
  ]);
  const [secondRoundKeepCount, setSecondRoundKeepCount] = useState(2);
  const [roundSnapshots, setRoundSnapshots] = useState<Record<number, RoundSnapshot>>({});

  const [exportFormat, setExportFormat] = useState<"png" | "jpg">("png");
  const [exportMeta, setExportMeta] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedParty = useMemo(
    () => partyList?.find((party) => party.id === partyId) ?? null,
    [partyId, partyList],
  );

  useEffect(() => {
    if (!session) {
      setPartyList(null);
      setPartyErr(null);
      setPartyLoading(false);
      setPartyId(null);
      return;
    }

    setPartyLoading(true);
    setPartyErr(null);
    setPartyList(null);
    (async () => {
      try {
        const response = await authFetch(`${API}/players/me/parties`);
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Session expired. Please sign in again."
              : `Failed to load your party (${response.status})`,
          );
        }

        const data = await response.json();
        const raw: any[] = Array.isArray(data) ? data : data?.parties ?? [];
        const normalized: Party[] = raw.map((party) => ({
          id: party.id ?? party.party_id,
          name: party.name ?? party.party_name ?? "",
          abbreviation: party.abbreviation ?? "",
          color: party.color ?? null,
          logo_url: party.logo_url ?? null,
          nation_id: party.nation_id,
        }));

        const enriched = await Promise.all(
          normalized.map(async (party) => {
            if (party.abbreviation && party.color) return party;
            try {
              const details = await fetch(`${API}/parties/${party.id}`);
              if (!details.ok) return party;
              const json = await details.json();
              return {
                ...party,
                name: party.name || json.name,
                abbreviation: party.abbreviation || json.abbreviation || "",
                color: party.color || json.color || null,
                logo_url: party.logo_url || json.logo_url || null,
                nation_id: party.nation_id ?? json.nation_id,
              } as Party;
            } catch {
              return party;
            }
          }),
        );

        setPartyList(enriched);
        setPartyId((current) =>
          current && enriched.some((party) => party.id === current)
            ? current
            : enriched[0]?.id ?? null,
        );
      } catch (error) {
        setPartyErr(String((error as Error).message || error));
      } finally {
        setPartyLoading(false);
      }
    })();
  }, [authFetch, session]);

  useEffect(() => {
    if (!session || partyId == null) {
      setPositions([]);
      setFigures([]);
      return;
    }

    let cancelled = false;
    Promise.all([
      fetch(`${API}/parties/${partyId}/positions`).then(async (response) => {
        if (!response.ok) return [] as Position[];
        return (await response.json()) as Position[];
      }),
      authFetch(`${API}/parties/${partyId}/political-figures`).then(async (response) => {
        if (!response.ok) return [] as Figure[];
        return (await response.json()) as Figure[];
      }),
    ])
      .then(([loadedPositions, loadedFigures]) => {
        if (cancelled) return;
        setPositions(loadedPositions);
        setFigures(loadedFigures);
      })
      .catch(() => {
        if (cancelled) return;
        setPositions([]);
        setFigures([]);
      });

    return () => {
      cancelled = true;
    };
  }, [authFetch, partyId, session]);

  useEffect(() => {
    const partyColor = selectedParty?.color;
    if (!partyColor) return;
    setFactions((current) =>
      current.map((f) => (f.id === "continuity" ? { ...f, color: partyColor } : f)),
    );
  }, [selectedParty?.color]);

  useEffect(() => {
    const nationId = selectedParty?.nation_id;
    if (nationId == null) {
      return;
    }

    let cancelled = false;
    fetch(`${API}/nations/${nationId}/polls/national?offset=0&limit=1`)
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as LatestPollListResponse;
        const latest = parseGameMonth(data.items?.[0]?.game_month ?? null);
        if (cancelled) return;
        if (!latest) return;
        setPollMonth(latest.month);
        setPollYear(latest.year);
      })
      .catch(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };
  }, [selectedParty?.nation_id]);

  useEffect(() => {
    if (electionType === "leadership" && roleTitle.trim().length === 0) {
      setRoleTitle("Party President");
    }
    if (electionType === "internal-role" && roleTitle.trim().length === 0) {
      setRoleTitle("Internal Role");
    }
  }, [electionType, roleTitle]);

  const computed = useMemo(() => {
    return computeSimpleResult({
      candidates,
      factions,
      blocs,
      partyMembership,
      turnoutPct,
      spoiledPct,
      absoluteMajority,
    });
  }, [absoluteMajority, blocs, candidates, factions, partyMembership, turnoutPct, spoiledPct]);

  const sortedCandidates = useMemo(() => {
    return [...computed.candidates].sort((left, right) => right.votes - left.votes);
  }, [computed.candidates]);

  const candidateChartRows = useMemo<HorizontalBarDatum[]>(() => {
    return sortedCandidates.map((entry) => {
      const faction = factions.find((row) => row.id === entry.candidate.factionId) ?? null;
      return {
        id: entry.candidate.id,
        label: entry.candidate.name,
        secondary: faction?.name ?? "Independent",
        votes: entry.votes,
        sharePct: entry.sharePct,
        color: safeColor(faction?.color ?? "#334155"),
        winner: computed.winnerCandidateId === entry.candidate.id,
      };
    });
  }, [computed.winnerCandidateId, factions, sortedCandidates]);

  const factionChartRows = useMemo<HorizontalBarDatum[]>(() => {
    return computed.factions
      .slice()
      .sort((left, right) => right.votes - left.votes)
      .map((entry) => {
        const faction = factions.find((row) => row.id === entry.factionId) ?? null;
        const factionCandidates = candidates
          .filter((c) => (entry.factionId === null ? c.factionId === null : c.factionId === entry.factionId))
          .map((c) => c.name)
          .join(", ");
        return {
          id: entry.factionId ?? entry.label,
          label: entry.label,
          secondary: factionCandidates || undefined,
          votes: entry.votes,
          sharePct: entry.sharePct,
          color: safeColor(faction?.color ?? "#64748b"),
          winner: false,
        };
      });
  }, [candidates, computed.factions, factions]);

  const roundLabel = `Round ${currentRound}`;
  const nextRoundLabel = `${formatOrdinal(currentRound + 1)} round required`;
  const roundSlug = `round-${currentRound}`;

  useEffect(() => {
    setRoundSnapshots((current) => {
      if (current[1]) return current;
      return { 1: createRoundSnapshot(candidates, factions, blocs) };
    });
  }, [blocs, candidates, factions]);

  useEffect(() => {
    setRoundSnapshots((current) => ({
      ...current,
      [currentRound]: createRoundSnapshot(candidates, factions, blocs),
    }));
  }, [blocs, candidates, currentRound, factions]);

  useEffect(() => {
    setSecondRoundPrepared(currentRound < maxRoundReached);
  }, [currentRound, maxRoundReached]);

  useEffect(() => {
    const maxKeep = Math.max(2, candidates.length - 1);
    setSecondRoundKeepCount((current) => clamp(current, 2, maxKeep));
  }, [candidates.length]);

  const loadRound = (round: number) => {
    const snapshot = roundSnapshots[round];
    if (!snapshot) return;

    setCurrentRound(round);
    setCandidates(cloneCandidates(snapshot.candidates));
    setFactions(cloneFactions(snapshot.factions));
    setBlocs(cloneBlocs(snapshot.blocs));
  };

  const handlePrepareSecondRound = () => {
    const maxKeep = Math.max(2, candidates.length - 1);
    const keepCount = clamp(secondRoundKeepCount, 2, maxKeep);
    const nextRound = currentRound + 1;

    const keepSet = new Set(
      sortedCandidates.slice(0, keepCount).map((entry) => entry.candidate.id),
    );

    const votesByCandidate = new Map(
      sortedCandidates.map((entry) => [entry.candidate.id, entry.votes] as const),
    );

    const keptCandidates = candidates.filter((candidate) => keepSet.has(candidate.id));
    const keptVotes = keptCandidates.reduce(
      (sum, candidate) => sum + (votesByCandidate.get(candidate.id) ?? 0),
      0,
    );

    const nextCandidates = keptCandidates.map((candidate) => {
      const voteShare = keptVotes > 0 ? ((votesByCandidate.get(candidate.id) ?? 0) / keptVotes) * 100 : 0;
      return {
        ...candidate,
        basePoints: Math.max(1, Number(voteShare.toFixed(2))),
      };
    });

    const usedFactionIds = new Set(nextCandidates.map((candidate) => candidate.factionId).filter(Boolean));
    const nextFactions = factions.filter((faction) => usedFactionIds.has(faction.id));
    const nextBlocs = blocs.map((bloc) => ({
      ...bloc,
      candidateId: bloc.candidateId && keepSet.has(bloc.candidateId) ? bloc.candidateId : null,
    }));

    setRoundSnapshots((current) => ({
      ...current,
      [currentRound]: createRoundSnapshot(candidates, factions, blocs),
      [nextRound]: createRoundSnapshot(nextCandidates, nextFactions, nextBlocs),
    }));

    setCandidates(nextCandidates);
    setFactions(nextFactions);
    setBlocs(nextBlocs);
    setSecondRoundPrepared(true);
    setCurrentRound(nextRound);
    setMaxRoundReached((current) => Math.max(current, nextRound));
  };

  const handleExportImage = async () => {
    const node = chartRef.current;
    if (!node) return;
    setExportBusy(true);

    const prevPadding = node.style.padding;
    const prevBackground = node.style.backgroundColor;
    const prevBoxSizing = node.style.boxSizing;

    node.style.padding = "20px";
    node.style.backgroundColor = "#ffffff";
    node.style.boxSizing = "border-box";

    const hidden: Array<{ el: HTMLElement; prev: string }> = [];
    if (!exportMeta) {
      node.querySelectorAll<HTMLElement>("[data-export-meta]").forEach((element) => {
        hidden.push({ el: element, prev: element.style.display });
        element.style.display = "none";
      });
    }

    try {
      const options = { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true };
      const dataUrl =
        exportFormat === "png"
          ? await toPng(node, options)
          : await toJpeg(node, { ...options, quality: 0.95 });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      const runoffSuffix = absoluteMajority && computed.secondRoundRequired ? "-second-round-required" : "";
      anchor.download = `ptr-primary-${slugify(selectedNation?.name ?? "nation")}-${slugify(selectedParty?.abbreviation ?? "party")}-${slugify(roleTitle || electionType)}-${roundSlug}${runoffSuffix}.${exportFormat}`;
      anchor.click();
    } catch (error) {
      console.error("Chart export failed", error);
    } finally {
      hidden.forEach(({ el, prev }) => {
        el.style.display = prev;
      });
      node.style.padding = prevPadding;
      node.style.backgroundColor = prevBackground;
      node.style.boxSizing = prevBoxSizing;
      setExportBusy(false);
    }
  };

  const handleExportCsv = () => {
    const winner = computed.winnerCandidateId
      ? candidates.find((candidate) => candidate.id === computed.winnerCandidateId)?.name ?? ""
      : "";
    const rows = [
      ["nation", selectedNation?.name ?? ""],
      ["party", selectedParty?.name ?? ""],
      ["election_type", electionType],
      ["role", roleTitle],
      ["round", roundLabel],
      ["vote_model", "simple"],
      ["absolute_majority", absoluteMajority ? "yes" : "no"],
      ["second_round_required", computed.secondRoundRequired ? "yes" : "no"],
      ["second_round_prepared", secondRoundPrepared ? "yes" : "no"],
      ["max_round_reached", String(maxRoundReached)],
      ["party_membership", String(partyMembership)],
      ["turnout_pct", String(turnoutPct)],
      ["spoiled_pct", String(spoiledPct)],
      ["winner", winner],
      [],
      ["candidate", "faction", "votes", "share_pct"],
      ...sortedCandidates.map((entry) => [
        entry.candidate.name,
        factionName(entry.candidate.factionId, factions),
        String(Math.round(entry.votes)),
        entry.sharePct.toFixed(2),
      ]),
    ];

    const csvText = rows.map((line) => line.map(csvCell).join(",")).join("\n");
    downloadBlob(csvText, "text/csv;charset=utf-8", `ptr-primary-${slugify(selectedNation?.name ?? "nation")}-${slugify(selectedParty?.abbreviation ?? "party")}.csv`);
  };

  const handleSaveScenario = () => {
    const scenario: ScenarioData = {
      version: 1,
      nationId: selectedParty?.nation_id ?? null,
      partyId,
      electionType,
      roleTitle,
      pollMonth,
      pollYear,
      absoluteMajority,
      secondRoundPrepared,
      chartMode,
      partyMembership,
      turnoutPct,
      spoiledPct,
      secondRoundKeepCount,
      currentRound,
      maxRoundReached,
      roundSnapshots: Object.fromEntries(
        Object.entries(roundSnapshots).map(([round, snapshot]) => [
          round,
          createRoundSnapshot(snapshot.candidates, snapshot.factions, snapshot.blocs),
        ]),
      ),
      candidates,
      factions,
      blocs,
    };

    const jsonText = JSON.stringify(scenario, null, 2);
    downloadBlob(jsonText, "application/json;charset=utf-8", `ptr-primary-scenario-${slugify(selectedNation?.name ?? "nation")}-${slugify(selectedParty?.abbreviation ?? "party")}.json`);
  };

  const handleLoadScenarioClick = () => {
    fileInputRef.current?.click();
  };

  const handleLoadScenarioFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ScenarioData>;

      if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
        throw new Error("Invalid scenario: candidates are required.");
      }

      const loadedCandidates = parsed.candidates
        .map((candidate) => ({
          id: typeof candidate.id === "string" ? candidate.id : uid("cand"),
          name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : "Candidate",
          factionId: typeof candidate.factionId === "string" ? candidate.factionId : null,
          basePoints: num(candidate.basePoints, 0),
        }))
        .slice(0, 25);

      const loadedFactions = Array.isArray(parsed.factions) && parsed.factions.length > 0
        ? parsed.factions.map((faction) => ({
            id: typeof faction.id === "string" ? faction.id : uid("fac"),
            name: typeof faction.name === "string" && faction.name.trim() ? faction.name : "Faction",
            color: safeColor(typeof faction.color === "string" ? faction.color : FALLBACK_COLOR),
            turnoutBoostPct: clamp(num(faction.turnoutBoostPct, 0), -80, 120),
          }))
        : defaultFactions;

      const loadedBlocs = Array.isArray(parsed.blocs)
        ? parsed.blocs.map((bloc) => ({
            id: typeof bloc.id === "string" ? bloc.id : uid("bloc"),
            name: typeof bloc.name === "string" && bloc.name.trim() ? bloc.name : "Bloc",
            candidateId: typeof bloc.candidateId === "string" ? bloc.candidateId : null,
            weightPoints: clamp(num(bloc.weightPoints, 0), 0, 100),
          }))
        : [];

      setElectionType(parsed.electionType === "internal-role" ? "internal-role" : "leadership");
      setRoleTitle(typeof parsed.roleTitle === "string" ? parsed.roleTitle : "Party President");
      setAbsoluteMajority(parsed.absoluteMajority !== false);
      const loadedCurrentRound = Math.max(1, Math.floor(num(parsed.currentRound, 1)));
      const loadedSnapshots = normalizeRoundSnapshots(parsed.roundSnapshots);
      const loadedSnapshot = loadedSnapshots[loadedCurrentRound] ?? createRoundSnapshot(loadedCandidates, loadedFactions, loadedBlocs);
      const loadedMaxRound = Math.max(
        loadedCurrentRound,
        Math.floor(num(parsed.maxRoundReached, loadedCurrentRound)),
        ...Object.keys(loadedSnapshots).map((key) => Number(key)).filter(Number.isFinite),
      );

      setRoundSnapshots(
        Object.keys(loadedSnapshots).length > 0
          ? loadedSnapshots
          : { [loadedCurrentRound]: loadedSnapshot },
      );
      setCurrentRound(loadedCurrentRound);
      setMaxRoundReached(Math.max(1, loadedMaxRound));
      setSecondRoundPrepared(loadedCurrentRound < Math.max(1, loadedMaxRound));
      setChartMode(parsed.chartMode === "factions" ? "factions" : "candidates");
      setPartyMembership(clamp(num(parsed.partyMembership, 50000), 100, 50_000_000));
      setTurnoutPct(clamp(num(parsed.turnoutPct, 62), 0, 100));
      setSpoiledPct(clamp(num(parsed.spoiledPct, 1), 0, 50));
      setPollMonth(normalizePollMonth(parsed.pollMonth) ?? defaultPollDate.month);
      setPollYear(clamp(Math.floor(num(parsed.pollYear, defaultPollDate.year)), 1900, 9999));
      setSecondRoundKeepCount(clamp(num(parsed.secondRoundKeepCount, 2), 2, 100));
      setCandidates(cloneCandidates(loadedSnapshot.candidates));
      setFactions(cloneFactions(loadedSnapshot.factions));
      setBlocs(cloneBlocs(loadedSnapshot.blocs));

      if (typeof parsed.partyId === "number") {
        setPartyId(parsed.partyId);
      }
    } catch (error) {
      alert(String((error as Error).message || error));
    } finally {
      event.target.value = "";
    }
  };

  const prefillFromFigures = () => {
    if (figures.length === 0) return;
    const top = [...figures]
      .sort((left, right) => (num(right.charisma, 0) - num(left.charisma, 0)))
      .slice(0, 8);

    const targetFactionIds = factions.length > 0 ? factions.map((faction) => faction.id) : [null];
    const nextCandidates: Candidate[] = top.map((figure, index) => ({
      id: uid("cand"),
      name: (figure.name ?? figure.full_name ?? `Figure ${figure.id}`).trim(),
      factionId: targetFactionIds[index % targetFactionIds.length],
      basePoints: Math.max(5, 100 - index * 8),
    }));

    if (nextCandidates.length > 0) {
      setCandidates(nextCandidates);
      setRoundSnapshots({
        1: createRoundSnapshot(nextCandidates, factions, blocs),
      });
      setCurrentRound(1);
      setMaxRoundReached(1);
      setSecondRoundPrepared(false);
    }
  };

  const prefillRoleFromPositions = (positionId: string) => {
    const selectedPosition = positions.find((position) => String(position.id) === positionId);
    if (selectedPosition) setRoleTitle(selectedPosition.title);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-[88rem] px-4 py-6 space-y-8 sm:px-6 sm:py-8">
          <header className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Party Primary</h1>
            <p className="text-sm text-muted-foreground">
              Build internal party leadership or role elections with turnout, factions, absolute-majority logic, and exportable visuals.
              Sign-in is required.
            </p>
          </header>
          <EmptyState
            message="Sign in (top-right) to access Party Primary and load your own party candidates."
            tone="error"
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[88rem] px-4 py-6 space-y-8 sm:px-6 sm:py-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Party Primary</h1>
          <p className="text-sm text-muted-foreground">
            Build internal party leadership or role elections with turnout, factions, absolute-majority logic, and exportable visuals.
            Sign-in is required.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Party
            </label>
            {partyErr ? (
              <div className="text-sm text-destructive">Failed to load parties: {partyErr}</div>
            ) : partyLoading || !partyList ? (
              <div className="text-sm text-muted-foreground">Loading parties...</div>
            ) : partyList.length === 0 ? (
              <div className="text-sm text-muted-foreground">Your account is not linked to any party.</div>
            ) : (
              <Select
                value={partyId != null ? String(partyId) : ""}
                onValueChange={(value) => setPartyId(value ? Number(value) : null)}
              >
                <SelectTrigger className="h-10 w-full bg-background text-sm">
                  {selectedParty ? (
                    <div className="truncate">{selectedParty.abbreviation} - {selectedParty.name}</div>
                  ) : (
                    <SelectValue placeholder="Select party" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {partyList.map((party) => (
                    <SelectItem key={party.id} value={String(party.id)}>
                      {party.abbreviation} - {party.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Election type
            </label>
            <div className="inline-flex h-10 rounded-md border border-border p-0.5 bg-secondary w-full">
              <button
                type="button"
                onClick={() => setElectionType("leadership")}
                className={`flex-1 px-3 text-xs font-medium rounded-[5px] transition-colors ${
                  electionType === "leadership"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Internal Role
              </button>
              <button
                type="button"
                onClick={() => setElectionType("internal-role")}
                className={`flex-1 px-3 text-xs font-medium rounded-[5px] transition-colors ${
                  electionType === "internal-role"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {(selectedParty?.abbreviation ?? "Party").toUpperCase()} Positions
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Election threshold
            </label>
            <div className="space-y-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={absoluteMajority}
                  onChange={(event) => {
                    setAbsoluteMajority(event.target.checked);
                    setSecondRoundPrepared(false);
                    loadRound(1);
                  }}
                  className="h-4 w-4 accent-foreground"
                />
                Require 50%+ absolute majority to win
              </label>

              {absoluteMajority && computed.secondRoundRequired && candidates.length > 2 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs space-y-2">
                  <div className="text-amber-800 font-medium">{nextRoundLabel}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-800">Keep top</span>
                    <input
                      type="number"
                      min={2}
                      max={Math.max(2, candidates.length - 1)}
                      step={1}
                      value={secondRoundKeepCount}
                      onChange={(event) =>
                        setSecondRoundKeepCount(
                          clamp(num(event.target.value, 2), 2, Math.max(2, candidates.length - 1)),
                        )
                      }
                      className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right"
                    />
                    <span className="text-amber-800">candidates</span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrepareSecondRound}
                    className="h-8 px-2.5 rounded-md border border-amber-400 bg-background hover:bg-amber-100 text-amber-900"
                  >
                    Prepare extra round automatically
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Role / office
            </label>
            {session && electionType === "internal-role" && positions.length > 0 ? (
              <Select
                value={String(positions.find((p) => p.title === roleTitle)?.id ?? "")}
                onValueChange={(value) => prefillRoleFromPositions(value)}
              >
                <SelectTrigger className="h-10 w-full bg-background text-sm">
                  <SelectValue placeholder={`Select from ${(selectedParty?.abbreviation ?? "party").toUpperCase()} positions`} />
                </SelectTrigger>
                <SelectContent>
                  {positions
                    .slice()
                    .sort((left, right) => left.display_order - right.display_order)
                    .map((position) => (
                      <SelectItem key={position.id} value={String(position.id)}>
                        {position.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <input
                type="text"
                value={roleTitle}
                onChange={(event) => setRoleTitle(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={electionType === "leadership" ? "Party President" : "Role name"}
              />
            )}
          </div>

          <NumberField
            label="Party membership"
            value={partyMembership}
            min={100}
            step={100}
            onChange={setPartyMembership}
          />
          <NumberField label="Turnout %" value={turnoutPct} min={0} max={100} step={0.5} onChange={setTurnoutPct} />
          <NumberField label="Blank %" value={spoiledPct} min={0} max={50} step={0.1} onChange={setSpoiledPct} />
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Primary date
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
              <Select value={pollMonth} onValueChange={(value) => setPollMonth(normalizePollMonth(value) ?? defaultPollDate.month)}>
                <SelectTrigger className="h-10 w-full bg-background text-sm">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {POLL_MONTH_OPTIONS.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="number"
                min={1900}
                max={9999}
                step={1}
                value={pollYear}
                onChange={(event) => setPollYear(clamp(Math.floor(num(event.target.value, pollYear)), 1900, 9999))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Candidates</h2>
              <div className="flex flex-wrap items-center gap-2">
                {session && figures.length > 0 && (
                  <button
                    type="button"
                    onClick={prefillFromFigures}
                    className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary text-xs"
                  >
                    Prefill from {(selectedParty?.abbreviation ?? "party").toUpperCase()} figures
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setCandidates((current) => [
                      ...current,
                      {
                        id: uid("cand"),
                        name: `Candidate ${String.fromCharCode(65 + Math.min(25, current.length))}`,
                        factionId: factions[0]?.id ?? null,
                        basePoints: 10,
                      },
                    ])
                  }
                  className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary text-xs"
                >
                  Add candidate
                </button>
              </div>
            </div>

            {candidates.length === 0 ? (
              <EmptyState message="Add at least one candidate." />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {candidates.map((candidate, index) => (
                    <div key={candidate.id} className="rounded-lg border border-border bg-background p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Name
                          </label>
                          <input
                            type="text"
                            value={candidate.name}
                            onChange={(event) =>
                              setCandidates((current) =>
                                current.map((row) =>
                                  row.id === candidate.id ? { ...row, name: event.target.value } : row,
                                ),
                              )
                            }
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Faction
                          </label>
                          <Select
                            value={candidate.factionId ?? "__none__"}
                            onValueChange={(value) =>
                              setCandidates((current) =>
                                current.map((row) =>
                                  row.id === candidate.id
                                    ? { ...row, factionId: value === "__none__" ? null : value }
                                    : row,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="h-9 w-full bg-background text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No faction</SelectItem>
                              {factions.map((faction) => (
                                <SelectItem key={faction.id} value={faction.id}>
                                  {faction.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Base points
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={candidate.basePoints}
                            onChange={(event) =>
                              setCandidates((current) =>
                                current.map((row) =>
                                  row.id === candidate.id
                                    ? { ...row, basePoints: num(event.target.value, 0) }
                                    : row,
                                ),
                              )
                            }
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-right"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCandidates((current) => move(current, index, Math.max(0, index - 1)))
                          }
                          className="h-8 rounded-md border border-border px-2.5 text-xs"
                          title="Move up"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCandidates((current) =>
                              move(current, index, Math.min(current.length - 1, index + 1)),
                            )
                          }
                          className="h-8 rounded-md border border-border px-2.5 text-xs"
                          title="Move down"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCandidates((current) => current.filter((row) => row.id !== candidate.id))
                          }
                          className="h-8 rounded-md border border-border px-2.5 text-xs text-destructive"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                  <table className="min-w-[680px] w-full text-sm">
                    <thead className="bg-secondary text-muted-foreground text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Name</th>
                        <th className="text-left font-medium px-3 py-2">Faction</th>
                        <th className="text-right font-medium px-3 py-2">Base points</th>
                        <th className="text-right font-medium px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((candidate, index) => (
                        <tr key={candidate.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={candidate.name}
                              onChange={(event) =>
                                setCandidates((current) =>
                                  current.map((row) =>
                                    row.id === candidate.id ? { ...row, name: event.target.value } : row,
                                  ),
                                )
                              }
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={candidate.factionId ?? "__none__"}
                              onValueChange={(value) =>
                                setCandidates((current) =>
                                  current.map((row) =>
                                    row.id === candidate.id
                                      ? { ...row, factionId: value === "__none__" ? null : value }
                                      : row,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="h-8 w-full bg-background text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">No faction</SelectItem>
                                {factions.map((faction) => (
                                  <SelectItem key={faction.id} value={faction.id}>
                                    {faction.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={candidate.basePoints}
                              onChange={(event) =>
                                setCandidates((current) =>
                                  current.map((row) =>
                                    row.id === candidate.id
                                      ? { ...row, basePoints: num(event.target.value, 0) }
                                      : row,
                                  ),
                                )
                              }
                              className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm text-right"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setCandidates((current) => move(current, index, Math.max(0, index - 1)))
                                }
                                className="h-7 px-2 rounded-md border border-border text-xs"
                                title="Move up"
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCandidates((current) =>
                                    move(current, index, Math.min(current.length - 1, index + 1)),
                                  )
                                }
                                className="h-7 px-2 rounded-md border border-border text-xs"
                                title="Move down"
                              >
                                Down
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCandidates((current) => current.filter((row) => row.id !== candidate.id))
                                }
                                className="h-7 px-2 rounded-md border border-border text-xs text-destructive"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Factions</h2>
                <button
                  type="button"
                  onClick={() =>
                    setFactions((current) => [
                      ...current,
                      {
                        id: uid("fac"),
                        name: `Faction ${current.length + 1}`,
                        color: randomColor(current.length),
                        turnoutBoostPct: 0,
                      },
                    ])
                  }
                  className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary text-xs"
                >
                  Add faction
                </button>
              </div>
              <div className="space-y-2">
                {factions.map((faction) => (
                  <div key={faction.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_80px_120px_auto] sm:items-end">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Name
                        </label>
                        <input
                          type="text"
                          value={faction.name}
                          onChange={(event) =>
                            setFactions((current) =>
                              current.map((row) =>
                                row.id === faction.id ? { ...row, name: event.target.value } : row,
                              ),
                            )
                          }
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Color
                        </label>
                        <input
                          type="color"
                          value={safeColor(faction.color)}
                          onChange={(event) =>
                            setFactions((current) =>
                              current.map((row) =>
                                row.id === faction.id ? { ...row, color: event.target.value } : row,
                              ),
                            )
                          }
                          className="h-9 w-full rounded-md border border-input bg-background p-1"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Turnout boost %
                        </label>
                        <input
                          type="number"
                          min={-80}
                          max={120}
                          step={1}
                          value={faction.turnoutBoostPct}
                          onChange={(event) =>
                            setFactions((current) =>
                              current.map((row) =>
                                row.id === faction.id
                                  ? { ...row, turnoutBoostPct: clamp(num(event.target.value, 0), -80, 120) }
                                  : row,
                              ),
                            )
                          }
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-right"
                          title="Turnout boost %"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFactions((current) => current.filter((row) => row.id !== faction.id))}
                        className="h-9 rounded-md border border-border px-3 text-xs text-destructive sm:self-end"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Regional / delegate blocs</h2>
                <button
                  type="button"
                  onClick={() =>
                    setBlocs((current) => [
                      ...current,
                      { id: uid("bloc"), name: `Bloc ${current.length + 1}`, candidateId: null, weightPoints: 3 },
                    ])
                  }
                  className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary text-xs"
                >
                  Add bloc
                </button>
              </div>

              <div className="space-y-2">
                {blocs.map((bloc) => (
                  <div key={bloc.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px_auto] lg:items-end">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Bloc name
                        </label>
                        <input
                          type="text"
                          value={bloc.name}
                          onChange={(event) =>
                            setBlocs((current) =>
                              current.map((row) =>
                                row.id === bloc.id ? { ...row, name: event.target.value } : row,
                              ),
                            )
                          }
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Endorsement
                        </label>
                        <Select
                          value={bloc.candidateId ?? "__none__"}
                          onValueChange={(value) =>
                            setBlocs((current) =>
                              current.map((row) =>
                                row.id === bloc.id
                                  ? { ...row, candidateId: value === "__none__" ? null : value }
                                  : row,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="h-9 w-full bg-background text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No endorsement</SelectItem>
                            {candidates.map((candidate) => (
                              <SelectItem key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Weight
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={bloc.weightPoints}
                          onChange={(event) =>
                            setBlocs((current) =>
                              current.map((row) =>
                                row.id === bloc.id
                                  ? { ...row, weightPoints: clamp(num(event.target.value, 0), 0, 100) }
                                  : row,
                              ),
                            )
                          }
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-right"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setBlocs((current) => current.filter((row) => row.id !== bloc.id))}
                        className="h-9 rounded-md border border-border px-3 text-xs text-destructive lg:self-end"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>


        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Result chart</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-border p-0.5 bg-secondary">
                {Array.from({ length: maxRoundReached }, (_, index) => {
                  const round = index + 1;
                  return (
                    <button
                      key={round}
                      type="button"
                      onClick={() => loadRound(round)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                        currentRound === round
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {`Round ${round}`}
                    </button>
                  );
                })}
              </div>

              <div className="inline-flex rounded-md border border-border p-0.5 bg-secondary">
                <button
                  type="button"
                  onClick={() => setChartMode("candidates")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                    chartMode === "candidates"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Candidate view
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("factions")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                    chartMode === "factions"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Faction view
                </button>
              </div>
            </div>
          </div>

          <div ref={chartRef} className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div data-export-meta className="mb-3 border-b border-border pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {(selectedParty?.name ?? "No party selected")} - {roleTitle || (electionType === "leadership" ? "Leadership election" : "Internal election")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {(selectedParty?.abbreviation ?? "No party")} - {(selectedNation?.name ?? "No nation selected")} - {formatGameMonth(pollYear, pollMonth)}
                  </div>
                  <div className="mt-1 text-xs font-medium text-foreground">{roundLabel}</div>
                  {absoluteMajority && computed.secondRoundRequired && (
                    <div className="mt-1 text-xs font-medium text-amber-700">
                      {nextRoundLabel}
                    </div>
                  )}
                </div>
                {selectedParty?.logo_url ? (
                  <img
                    src={selectedParty.logo_url}
                    alt={selectedParty.name}
                    className="h-10 w-10 rounded-md border border-border object-contain bg-white"
                  />
                ) : (
                  <div
                    className="h-10 w-10 rounded-md border border-border"
                    style={{ backgroundColor: safeColor(selectedParty?.color ?? FALLBACK_COLOR) }}
                  />
                )}
              </div>
            </div>

            {chartMode === "candidates" ? (
              <HorizontalBarResultChart data={candidateChartRows} />
            ) : (
              <HorizontalBarResultChart data={factionChartRows} />
            )}

            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <StatCard label="Total ballots" value={fmtInt(computed.totalBallots)} />
              <StatCard label="Valid ballots" value={fmtInt(computed.validBallots)} />
              <StatCard label="Spoiled ballots" value={fmtInt(computed.spoiledBallots)} />
              <StatCard
                label="Winner"
                value={
                  computed.winnerCandidateId
                    ? candidates.find((candidate) => candidate.id === computed.winnerCandidateId)?.name ?? "-"
                    : "No winner"
                }
              />
            </div>

            {computed.warnings.length > 0 && (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {computed.warnings.join(" ")}
              </div>
            )}
          </div>
        </section>

      </main>

      <footer className="mt-12 border-t border-border">
        <div className="mx-auto max-w-[88rem] px-4 py-4 text-xs text-muted-foreground flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Data source: api.ptr.zanz2.dev</span>
          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(["png", "jpg"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setExportFormat(format)}
                  className={`px-2 py-1 uppercase tracking-wide ${
                    exportFormat === format
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={exportMeta}
                onChange={(event) => setExportMeta(event.target.checked)}
                className="h-3.5 w-3.5 accent-foreground"
              />
              Include metadata
            </label>

            <button
              type="button"
              onClick={handleExportImage}
              disabled={exportBusy}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {exportBusy ? "Exporting..." : "Export chart"}
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary"
            >
              Export CSV
            </button>

            <button
              type="button"
              onClick={handleSaveScenario}
              className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary"
            >
              Save JSON
            </button>

            <button
              type="button"
              onClick={handleLoadScenarioClick}
              className="h-7 px-2.5 rounded-md border border-border bg-background hover:bg-secondary"
            >
              Load JSON
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleLoadScenarioFile}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(num(event.target.value, value))}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

type HorizontalBarDatum = {
  id: string;
  label: string;
  secondary?: string;
  votes: number;
  sharePct: number;
  color: string;
  winner: boolean;
};

function HorizontalBarResultChart({ data }: { data: HorizontalBarDatum[] }) {
  const winnerEntry = data.find((entry) => entry.winner) ?? null;
  const chartData = data.map((entry) => ({
    ...entry,
    axisLabel: entry.label,
    votesRounded: Math.round(entry.votes),
    votesLabel: fmtInt(Math.round(entry.votes)),
    pctLabel: `${entry.sharePct.toFixed(2)}%`,
  }));
  const hasSecondary = chartData.some((d) => d.secondary);
  const chartHeight = Math.max(280, chartData.length * (hasSecondary ? 54 : 42));
  const maxSharePct = Math.max(1, ...chartData.map((entry) => entry.sharePct));
  const xAxisMax = Math.min(100, Math.max(1, maxSharePct * 1.08));

  return (
    <div className="rounded-md border border-border p-2">
      {winnerEntry ? (
        <div className="mb-2 inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          Winner {winnerEntry.label}
        </div>
      ) : null}
      <ChartContainer
        config={{
          sharePct: {
            label: "Share",
            color: "#64748b",
          },
        }}
        className="w-full"
        style={{ height: chartHeight }}
      >
        <RechartsBarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 16, left: -6, bottom: 8 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, xAxisMax]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
          />
          <YAxis
            type="category"
            dataKey="axisLabel"
            width={160}
            tickLine={false}
            axisLine={false}
            interval={0}
            tickMargin={4}
            tick={(props) => {
              const { x, y, payload } = props;
              const entry = chartData.find((d) => d.axisLabel === payload.value);
              return (
                <g transform={`translate(${x},${y})`}>
                  <text x={0} y={-4} textAnchor="end" fill="#0f172a" fontSize={12}>
                    {payload.value}
                  </text>
                  {entry?.secondary ? (
                    <text x={0} y={10} textAnchor="end" fill="#64748b" fontSize={10}>
                      {entry.secondary}
                    </text>
                  ) : null}
                </g>
              );
            }}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelKey="label"
                formatter={(_value, _name, item) => {
                  const row = item.payload as HorizontalBarDatum;
                  return (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">
                        {fmtInt(Math.round(row.votes))} ({row.sharePct.toFixed(2)}%)
                      </span>
                      {row.secondary ? <span className="text-muted-foreground">{row.secondary}</span> : null}
                      {row.winner ? <span className="text-emerald-700 font-medium">Winner</span> : null}
                    </div>
                  );
                }}
              />
            }
          />
          <Bar
            dataKey="sharePct"
            radius={6}
            isAnimationActive
            animationDuration={350}
            animationEasing="ease-out"
          >
            {chartData.map((entry) => (
              <Cell key={entry.id} fill={entry.color} />
            ))}
            <LabelList
              dataKey="votesLabel"
              position="insideRight"
              fill="#ffffff"
              fontSize={10}
              fontWeight={500}
            />
            <LabelList
              dataKey="pctLabel"
              position="right"
              fill="#0f172a"
              fontSize={12}
              fontWeight={600}
            />
          </Bar>
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function computeSimpleResult({
  candidates,
  factions,
  blocs,
  partyMembership,
  turnoutPct,
  spoiledPct,
  absoluteMajority,
}: {
  candidates: Candidate[];
  factions: Faction[];
  blocs: Bloc[];
  partyMembership: number;
  turnoutPct: number;
  spoiledPct: number;
  absoluteMajority: boolean;
}): ComputedResult {
  const warnings: string[] = [];

  const totalBallots = Math.max(0, partyMembership * (clamp(turnoutPct, 0, 100) / 100));
  const spoiledBallots = Math.max(0, totalBallots * (clamp(spoiledPct, 0, 100) / 100));
  const validBallots = Math.max(0, totalBallots - spoiledBallots);

  if (validBallots <= 0) {
    warnings.push("Valid ballots are zero. Increase turnout or reduce spoiled/blank ballots.");
  }

  const blocPoints = new Map<string, number>();
  for (const bloc of blocs) {
    if (!bloc.candidateId) continue;
    blocPoints.set(bloc.candidateId, (blocPoints.get(bloc.candidateId) ?? 0) + Math.max(0, bloc.weightPoints));
  }

  const weightedPoints = candidates.map((candidate) => {
    const faction = factions.find((item) => item.id === candidate.factionId) ?? null;
    const factionMultiplier = 1 + (faction?.turnoutBoostPct ?? 0) / 100;
    const points = Math.max(0, candidate.basePoints * Math.max(0.1, factionMultiplier)) + (blocPoints.get(candidate.id) ?? 0);
    return { candidate, points };
  });

  const sumPoints = weightedPoints.reduce((sum, row) => sum + row.points, 0);
  if (sumPoints <= 0) {
    warnings.push("All candidate points are zero. Increase base points or bloc support.");
  }

  const candidateRows: CandidateResult[] = weightedPoints.map((row) => {
    const share = sumPoints > 0 ? (row.points / sumPoints) : 0;
    const votes = validBallots * share;
    return {
      candidate: row.candidate,
      votes,
      sharePct: validBallots > 0 ? (votes / validBallots) * 100 : 0,
    };
  });

  const leader = candidateRows.slice().sort((left, right) => right.votes - left.votes)[0] ?? null;
  const leaderShare = leader?.sharePct ?? 0;
  const secondRoundRequired = absoluteMajority && candidateRows.length > 1 && leaderShare <= 50;
  const winner = secondRoundRequired ? null : (leader?.candidate.id ?? null);

  if (secondRoundRequired) {
    warnings.push("No candidate reached 50%");
  }

  const factionsGrouped = groupFactionVotes(candidateRows, factions);

  return {
    totalBallots,
    validBallots,
    spoiledBallots,
    winnerCandidateId: winner,
    secondRoundRequired,
    candidates: candidateRows,
    factions: factionsGrouped,
    warnings,
  };
}

function groupFactionVotes(
  rows: CandidateResult[],
  factions: Faction[],
): Array<{ factionId: string | null; label: string; votes: number; sharePct: number }> {
  const map = new Map<string, { factionId: string | null; label: string; votes: number }>();
  for (const row of rows) {
    const key = row.candidate.factionId ?? "__none__";
    const faction = factions.find((item) => item.id === row.candidate.factionId) ?? null;
    if (!map.has(key)) {
      map.set(key, {
        factionId: faction?.id ?? null,
        label: faction?.name ?? "No faction",
        votes: 0,
      });
    }
    const target = map.get(key);
    if (target) target.votes += row.votes;
  }

  const sum = [...map.values()].reduce((acc, item) => acc + item.votes, 0);
  return [...map.values()].map((item) => ({
    ...item,
    sharePct: sum > 0 ? (item.votes / sum) * 100 : 0,
  }));
}

function move<T>(list: T[], from: number, to: number) {
  if (from === to) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  if (item === undefined) return list;
  copy.splice(to, 0, item);
  return copy;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function num(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeColor(color: string | null | undefined) {
  if (!color) return FALLBACK_COLOR;
  return /^#([0-9a-f]{3}){1,2}$/i.test(color) ? color : FALLBACK_COLOR;
}

function factionName(factionId: string | null, factions: Faction[]) {
  return factions.find((faction) => faction.id === factionId)?.name ?? "No faction";
}

function fmtInt(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function parseGameMonth(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month] = match;
  const normalizedMonth = normalizePollMonth(month);
  if (!normalizedMonth) return null;

  return {
    year: Number(year),
    month: normalizedMonth,
  };
}

function normalizePollMonth(value: string | undefined) {
  if (!value) return null;
  return POLL_MONTH_OPTIONS.some((month) => month.value === value) ? value : null;
}

function getDefaultPollDate() {
  const today = new Date();
  return {
    month: String(today.getMonth() + 1).padStart(2, "0"),
    year: today.getFullYear(),
  };
}

function formatGameMonth(year: number, month: string) {
  const normalizedMonth = normalizePollMonth(month);
  if (!normalizedMonth || !Number.isFinite(year)) return "No poll date";

  const date = new Date(year, Number(normalizedMonth) - 1, 1);
  if (Number.isNaN(date.getTime())) return "No poll date";

  const monthLabel = new Intl.DateTimeFormat("en", { month: "long" }).format(date);
  return `${monthLabel} ${year}`;
}

function formatOrdinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

function cloneCandidates(candidates: Candidate[]) {
  return candidates.map((candidate) => ({ ...candidate }));
}

function cloneFactions(factions: Faction[]) {
  return factions.map((faction) => ({ ...faction }));
}

function cloneBlocs(blocs: Bloc[]) {
  return blocs.map((bloc) => ({ ...bloc }));
}

function createRoundSnapshot(candidates: Candidate[], factions: Faction[], blocs: Bloc[]): RoundSnapshot {
  return {
    candidates: cloneCandidates(candidates),
    factions: cloneFactions(factions),
    blocs: cloneBlocs(blocs),
  };
}

function normalizeRoundSnapshots(value: unknown): Record<number, RoundSnapshot> {
  if (!value || typeof value !== "object") return {};

  const entries = Object.entries(value as Record<string, unknown>);
  const normalized: Record<number, RoundSnapshot> = {};

  for (const [key, snapshot] of entries) {
    const round = Number(key);
    if (!Number.isFinite(round) || round < 1 || !snapshot || typeof snapshot !== "object") continue;

    const raw = snapshot as Partial<RoundSnapshot>;
    if (!Array.isArray(raw.candidates) || !Array.isArray(raw.factions) || !Array.isArray(raw.blocs)) continue;

    normalized[Math.floor(round)] = {
      candidates: cloneCandidates(raw.candidates as Candidate[]),
      factions: cloneFactions(raw.factions as Faction[]),
      blocs: cloneBlocs(raw.blocs as Bloc[]),
    };
  }

  return normalized;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "value";
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadBlob(content: string, mime: string, fileName: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function randomColor(index: number) {
  const palette = [
    "#2563eb",
    "#dc2626",
    "#059669",
    "#7c3aed",
    "#ea580c",
    "#0891b2",
    "#be123c",
  ];
  return palette[index % palette.length];
}

