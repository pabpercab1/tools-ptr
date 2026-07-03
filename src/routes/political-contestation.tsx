import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNation } from "@/lib/nation-context";
import {
  Cell,
  CartesianGrid,
  Customized,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/political-contestation")({
  head: () => ({
    meta: [
      { title: "Political Compass - PR:R Tools" },
      {
        name: "description",
        content:
          "Condense all active party ideology axes into a political compass with left-right and libertarian-authoritarian coordinates.",
      },
    ],
  }),
  component: PoliticalContestationTool,
});

const API = "/api/ptr";
const FALLBACK_COLOR = "#7c8798";
const COMPASS_X_NEGATIVE = "Left";
const COMPASS_X_POSITIVE = "Right";
const COMPASS_Y_NEGATIVE = "Libertarian";
const COMPASS_Y_POSITIVE = "Authoritarian";

const AXIS_WEIGHTS: Record<
  string,
  {
    x: number;
    y: number;
    label: string;
  }
> = {
  economic_redistribution: { x: 1, y: 0, label: "Economic Redistribution" },
  market_regulation: { x: 0.85, y: 0, label: "Market Regulation" },
  trade_policy: { x: 0.5, y: 0.1, label: "Trade Policy" },
  labor_relations: { x: 0.85, y: 0.05, label: "Labor Relations" },
  welfare_design: { x: 0.8, y: 0.1, label: "Welfare Design" },
  global_integration: { x: 0.45, y: 0.2, label: "Global Integration" },
  technological_stance: { x: 0.2, y: 0.25, label: "Technological Stance" },
  social_values: { x: 0, y: 1, label: "Social Values" },
  personal_liberty: { x: 0.1, y: 1, label: "Personal Liberty" },
  judicial_authority: { x: 0.05, y: 0.75, label: "Judicial Authority" },
  territorial_authority: { x: 0.05, y: 0.65, label: "Territorial Authority" },
  political_inclusiveness: { x: 0.1, y: 0.7, label: "Political Inclusiveness" },
  political_contestation: { x: 0.05, y: 0.45, label: "Political Contestation" },
  governance_philosophy: { x: 0.05, y: 0.55, label: "Governance Philosophy" },
  military_posture: { x: 0.15, y: 0.55, label: "Military Posture" },
  national_identity: { x: 0.15, y: 0.65, label: "National Identity" },
  immigration_policy: { x: 0.15, y: 0.7, label: "Immigration Policy" },
  demographic_focus: { x: 0.2, y: 0.1, label: "Demographic Focus" },
};

const COMPASS_AXIS_GROUPS = {
  x: [
    AXIS_WEIGHTS.economic_redistribution.label,
    AXIS_WEIGHTS.market_regulation.label,
    AXIS_WEIGHTS.trade_policy.label,
    AXIS_WEIGHTS.labor_relations.label,
    AXIS_WEIGHTS.welfare_design.label,
    AXIS_WEIGHTS.global_integration.label,
    AXIS_WEIGHTS.technological_stance.label,
    AXIS_WEIGHTS.demographic_focus.label,
  ],
  y: [
    AXIS_WEIGHTS.social_values.label,
    AXIS_WEIGHTS.personal_liberty.label,
    AXIS_WEIGHTS.judicial_authority.label,
    AXIS_WEIGHTS.territorial_authority.label,
    AXIS_WEIGHTS.political_inclusiveness.label,
    AXIS_WEIGHTS.political_contestation.label,
    AXIS_WEIGHTS.governance_philosophy.label,
    AXIS_WEIGHTS.military_posture.label,
    AXIS_WEIGHTS.national_identity.label,
    AXIS_WEIGHTS.immigration_policy.label,
  ],
} as const;

type ValueSource = "calculated" | "platform" | "both";

type AxisPosition = {
  axis_id: number;
  axis_code: string;
  axis_name: string;
  position_value: number;
  pole_negative_label: string;
  pole_positive_label: string;
};

type Party = {
  id: number;
  name: string;
  abbreviation: string;
  color: string | null;
  logo_url: string | null;
  vote_count: number;
  seat_count: number;
  platform_positions?: AxisPosition[];
  calculated_positions?: AxisPosition[];
};

type PartyPoint = {
  id: number;
  name: string;
  abbreviation: string;
  color: string;
  votes: number;
  seats: number;
  x: number;
  y: number;
  fill: string;
  source: Exclude<ValueSource, "both">;
  sourceLabel: string;
};

type CompassPair = {
  id: number;
  name: string;
  abbreviation: string;
  color: string;
  votes: number;
  seats: number;
  calculated: PartyPoint | null;
  platform: PartyPoint | null;
};

type MissingAxisEntry = {
  id: number;
  name: string;
  abbreviation: string;
};

type QuadrantSummary = {
  id: "q1" | "q2" | "q3" | "q4";
  title: string;
  subtitle: string;
  parties: PartyPoint[];
  totalVotes: number;
};

type CompassComputation = {
  x: number | null;
  y: number | null;
  missingAxes: string[];
};

type AxisDeviation = {
  axisCode: string;
  axisLabel: string;
  calculatedValue: number;
  platformValue: number;
  gap: number;
  negativePole: string;
  positivePole: string;
};

function safeColor(c: string | null | undefined) {
  if (!c) return FALLBACK_COLOR;
  return /^#([0-9a-f]{3}){1,2}$/i.test(c) ? c : FALLBACK_COLOR;
}

function colorLuma(hex: string) {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function isNearWhite(hex: string) {
  return colorLuma(hex) > 0.92;
}

function readableFillColor(hex: string) {
  return isNearWhite(hex) ? "#e5e7eb" : hex;
}

function readableStrokeColor(hex: string) {
  return isNearWhite(hex) ? "#111827" : hex;
}

function clampAxisValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function fmtAxis(value: number) {
  return value.toFixed(3);
}

function computeDeviationScore(gaps: number[], comparableCount: number, totalAxisCount: number) {
  if (comparableCount === 0 || totalAxisCount === 0) return null;

  // Normalize each gap from [0, 2] to [0, 1].
  const normalized = gaps.map((gap) => Math.max(0, Math.min(1, gap / 2)));
  const average = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
  const weightedAverage = normalized.reduce((sum, value) => sum + value * value, 0) / normalized.length;
  const maxGap = normalized.reduce((maxValue, value) => Math.max(maxValue, value), 0);
  const topThreeAverage = [...normalized].sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0) /
    Math.min(3, normalized.length);
  const largeDeviationShare = normalized.filter((value) => value >= 0.25).length / normalized.length;
  const extremeDeviationShare = normalized.filter((value) => value >= 0.45).length / normalized.length;
  const severeDeviationShare = normalized.filter((value) => value >= 0.65).length / normalized.length;
  const coverage = comparableCount / totalAxisCount;

  // Heavily weight outliers and top jumps so visually large moves drop score more.
  const basePenalty =
    average * 0.12 +
    weightedAverage * 0.2 +
    maxGap * 0.16 +
    topThreeAverage * 0.2 +
    largeDeviationShare * 0.12 +
    extremeDeviationShare * 0.1 +
    severeDeviationShare * 0.1 +
    (1 - coverage) * 0.15;

  const penalty = Math.max(0, Math.min(1, basePenalty * 1.45));

  return Math.max(0, Math.min(100, Math.round((1 - penalty) * 100)));
}

function axisToPercent(value: number) {
  return ((clampAxisValue(value) + 1) / 2) * 100;
}

function getPositionForAxis(party: Party, source: ValueSource, axisCode: string) {
  const positions = source === "calculated" ? party.calculated_positions : party.platform_positions;
  return positions?.find((position) => position.axis_code === axisCode) ?? null;
}

function computeCompassPoint(party: Party, source: ValueSource): CompassComputation {
  if (source === "both") {
    return { x: null, y: null, missingAxes: [] };
  }
  const positions = source === "calculated" ? party.calculated_positions : party.platform_positions;
  if (!positions?.length) {
    return { x: null, y: null, missingAxes: Object.keys(AXIS_WEIGHTS) };
  }

  let weightedX = 0;
  let weightedY = 0;
  let totalXWeight = 0;
  let totalYWeight = 0;
  const missingAxes: string[] = [];

  for (const [axisCode, weight] of Object.entries(AXIS_WEIGHTS)) {
    const position = positions.find((item) => item.axis_code === axisCode);
    if (!position) {
      missingAxes.push(weight.label);
      continue;
    }

    const value = clampAxisValue(Number(position.position_value));
    if (weight.x > 0) {
      weightedX += value * weight.x;
      totalXWeight += weight.x;
    }
    if (weight.y > 0) {
      weightedY += value * weight.y;
      totalYWeight += weight.y;
    }
  }

  return {
    x: totalXWeight > 0 ? clampAxisValue(weightedX / totalXWeight) : null,
    y: totalYWeight > 0 ? clampAxisValue(weightedY / totalYWeight) : null,
    missingAxes,
  };
}

function buildCompassPoint(party: Party, source: Exclude<ValueSource, "both">): PartyPoint | null {
  const compass = computeCompassPoint(party, source);
  if (compass.x == null || compass.y == null) return null;

  return {
    id: party.id,
    name: party.name,
    abbreviation: party.abbreviation || party.name.slice(0, 3).toUpperCase(),
    color: safeColor(party.color),
    votes: Number(party.vote_count ?? 0),
    seats: Number(party.seat_count ?? 0),
    x: compass.x,
    y: compass.y,
    fill: safeColor(party.color),
    source,
    sourceLabel: source === "calculated" ? "Calculated" : "Platform",
  };
}

function CompassConnectorLayer({
  calculatedPoints,
  platformPoints,
  xAxisMap,
  yAxisMap,
}: {
  calculatedPoints: PartyPoint[];
  platformPoints: PartyPoint[];
  xAxisMap?: Record<string, { scale?: (value: number) => number }>;
  yAxisMap?: Record<string, { scale?: (value: number) => number }>;
}) {
  const xScale = Object.values(xAxisMap ?? {})[0]?.scale;
  const yScale = Object.values(yAxisMap ?? {})[0]?.scale;
  if (!xScale || !yScale) return null;

  const platformById = new Map(platformPoints.map((point) => [point.id, point]));

  return (
    <g pointerEvents="none">
      {calculatedPoints.map((calculatedPoint) => {
        const platformPoint = platformById.get(calculatedPoint.id);
        if (!platformPoint) return null;

        const x1 = xScale(calculatedPoint.x);
        const y1 = yScale(calculatedPoint.y);
        const x2 = xScale(platformPoint.x);
        const y2 = yScale(platformPoint.y);
        const distance = Math.hypot(calculatedPoint.x - platformPoint.x, calculatedPoint.y - platformPoint.y);

        return (
          <g key={calculatedPoint.id}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={readableStrokeColor(calculatedPoint.color)}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              strokeWidth={distance > 0.75 ? 2.5 : 1.75}
            />
          </g>
        );
      })}
    </g>
  );
}

function BothPointsLayer({
  calculatedPoints,
  platformPoints,
  xAxisMap,
  yAxisMap,
}: {
  calculatedPoints: PartyPoint[];
  platformPoints: PartyPoint[];
  xAxisMap?: Record<string, { scale?: (value: number) => number }>;
  yAxisMap?: Record<string, { scale?: (value: number) => number }>;
}) {
  const xScale = Object.values(xAxisMap ?? {})[0]?.scale;
  const yScale = Object.values(yAxisMap ?? {})[0]?.scale;
  if (!xScale || !yScale) return null;

  const platformById = new Map(platformPoints.map((point) => [point.id, point]));

  return (
    <g pointerEvents="none">
      {calculatedPoints.map((calculatedPoint) => {
        const platformPoint = platformById.get(calculatedPoint.id);
        if (!platformPoint) return null;

        const calcX = xScale(calculatedPoint.x);
        const calcY = yScale(calculatedPoint.y);
        const platX = xScale(platformPoint.x);
        const platY = yScale(platformPoint.y);
        const distance = Math.hypot(calculatedPoint.x - platformPoint.x, calculatedPoint.y - platformPoint.y);
        const labelOffset = distance < 0.14 ? 12 : 10;

        return (
          <g key={calculatedPoint.id}>
            <line
              x1={calcX}
              y1={calcY}
              x2={platX}
              y2={platY}
              stroke={readableStrokeColor(calculatedPoint.color)}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              strokeWidth={distance > 0.75 ? 2.5 : 1.75}
            />
            <circle
              cx={calcX}
              cy={calcY}
              r={6}
              fill={readableFillColor(calculatedPoint.color)}
              stroke={readableStrokeColor(calculatedPoint.color)}
              strokeWidth={1.5}
            />
            <circle cx={calcX} cy={calcY} r={2.5} fill="#ffffff" opacity={0.95} />
            <text
              x={calcX}
              y={calcY - 14}
              textAnchor="middle"
              fontSize="10"
              fontWeight={700}
              fill="#000000"
            >
              {calculatedPoint.abbreviation}
            </text>
            <circle
              cx={platX}
              cy={platY}
              r={6}
              fill="#ffffff"
              stroke={readableStrokeColor(platformPoint.color)}
              strokeWidth={2.25}
            />
            <circle cx={platX} cy={platY} r={2.5} fill={readableStrokeColor(platformPoint.color)} opacity={0.95} />
            <text
              x={platX}
              y={platY + labelOffset + 6}
              textAnchor="middle"
              fontSize="10"
              fontWeight={700}
              fill="#000000"
            >
              {platformPoint.abbreviation}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function BlackLabel(props: any) {
  const { x, y, value } = props;
  if (x == null || y == null || value == null) return null;
  return (
    <text
      x={x}
      y={y - 10}
      textAnchor="middle"
      fontSize="10"
      fontWeight={700}
      fill="#000000"
    >
      {value}
    </text>
  );
}

function IdeologyGlyph({ point }: { point: PartyPoint }) {
  const xPct = ((point.x + 1) / 2) * 100;
  const yPct = ((1 - point.y) / 2) * 100;

  return (
    <div className="w-[92px]">
      <div className="relative h-10 w-[92px] rounded-md border border-border bg-background">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border/70" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-border/70" />
        <span
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            left: `${xPct}%`,
            top: `${yPct}%`,
            backgroundColor: readableFillColor(point.color),
            borderColor: readableStrokeColor(point.color),
          }}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10px] leading-none text-muted-foreground">
        <span>L</span>
        <span>R</span>
      </div>
    </div>
  );
}

function AxisDeviationGlyph({ entry }: { entry: AxisDeviation }) {
  const calculatedPct = axisToPercent(entry.calculatedValue);
  const platformPct = axisToPercent(entry.platformValue);
  const minPct = Math.min(calculatedPct, platformPct);
  const widthPct = Math.max(Math.abs(calculatedPct - platformPct), 0.75);
  const hoverText = [
    `${entry.axisLabel}`,
    `${entry.negativePole} <-> ${entry.positivePole}`,
    `Calculated: ${fmtAxis(entry.calculatedValue)}`,
    `Platform: ${fmtAxis(entry.platformValue)}`,
    `Deviation gap: ${fmtAxis(entry.gap)}`,
  ].join("\n");

  return (
    <div className="w-full max-w-[260px]" title={hoverText}>
      <div className="relative h-8 w-full rounded-md border border-border bg-background">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border/70" />
        <div className="absolute inset-x-2 top-0 bottom-0">
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/50"
            style={{
              left: `${minPct}%`,
              width: `${widthPct}%`,
            }}
          />
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-900 bg-slate-900"
            style={{ left: `${calculatedPct}%` }}
            aria-label="Calculated position"
          />
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-900 bg-white"
            style={{ left: `${platformPct}%` }}
            aria-label="Platform position"
          />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] leading-none text-muted-foreground">
        <span>{entry.negativePole}</span>
        <span>{entry.positivePole}</span>
      </div>
    </div>
  );
}

function getQuadrant(point: PartyPoint) {
  if (point.x >= 0 && point.y >= 0) return "q1";
  if (point.x < 0 && point.y >= 0) return "q2";
  if (point.x < 0 && point.y < 0) return "q3";
  return "q4";
}

function PoliticalContestationTool() {
  const { nationId, selectedNation } = useNation();

  const [source, setSource] = useState<ValueSource>("calculated");
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [parties, setParties] = useState<Party[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nationId == null) {
      setParties(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API}/parties?nation_id=${nationId}&active_only=true`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load parties (${response.status})`);
        }
        return (await response.json()) as Party[];
      })
      .then((data) => {
        if (cancelled) return;
        setParties(Array.isArray(data) ? data.slice(0, 12) : []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err?.message || err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nationId]);

  const axisMeta = useMemo(() => {
    return {
      xNegative: COMPASS_X_NEGATIVE,
      xPositive: COMPASS_X_POSITIVE,
      yNegative: COMPASS_Y_NEGATIVE,
      yPositive: COMPASS_Y_POSITIVE,
    };
  }, []);

  const points = useMemo(() => {
    if (source === "both") {
      return [];
    }
    const items = parties ?? [];
    const parsed: PartyPoint[] = [];

    for (const party of items) {
      const point = buildCompassPoint(party, source);
      if (!point) continue;
      parsed.push(point);
    }

    return parsed.sort((a, b) => b.votes - a.votes);
  }, [parties, source]);

  const compassPairs = useMemo<CompassPair[]>(() => {
    const items = parties ?? [];
    return items.map((party) => ({
      id: party.id,
      name: party.name,
      abbreviation: party.abbreviation || party.name.slice(0, 3).toUpperCase(),
      color: safeColor(party.color),
      votes: Number(party.vote_count ?? 0),
      seats: Number(party.seat_count ?? 0),
      calculated: buildCompassPoint(party, "calculated"),
      platform: buildCompassPoint(party, "platform"),
    }));
  }, [parties]);

  const calculatedPoints = useMemo(
    () => compassPairs.map((pair) => pair.calculated).filter((point): point is PartyPoint => !!point),
    [compassPairs],
  );

  const platformPoints = useMemo(
    () => compassPairs.map((pair) => pair.platform).filter((point): point is PartyPoint => !!point),
    [compassPairs],
  );

  const bothModePoints = useMemo(() => {
    if (source !== "both") return [];
    return [...calculatedPoints, ...platformPoints].sort((a, b) => b.votes - a.votes);
  }, [source, calculatedPoints, platformPoints]);

  const chartPoints = source === "both" ? bothModePoints : points;

  const missingAxisParties = useMemo(() => {
    const items = parties ?? [];
    const missing: MissingAxisEntry[] = [];

    for (const party of items) {
      if (source === "both") {
        const calculatedPoint = buildCompassPoint(party, "calculated");
        const platformPoint = buildCompassPoint(party, "platform");
        if (calculatedPoint && platformPoint) continue;
      } else {
        const compass = computeCompassPoint(party, source);
        if (compass.x != null && compass.y != null) continue;
      }
      missing.push({
        id: party.id,
        name: party.name,
        abbreviation: party.abbreviation || party.name,
      });
    }

    return missing;
  }, [parties, source]);

  const connectorCount = useMemo(() => {
    if (source !== "both") return 0;
    const platformById = new Map(platformPoints.map((point) => [point.id, point]));
    return calculatedPoints.filter((point) => platformById.has(point.id)).length;
  }, [source, calculatedPoints, platformPoints]);

  const quadrants = useMemo<QuadrantSummary[]>(() => {
    const base: QuadrantSummary[] = [
      {
        id: "q1",
        title: `${axisMeta.xPositive} ${axisMeta.yPositive}`,
        subtitle: "Economic right, socially authoritarian",
        parties: [],
        totalVotes: 0,
      },
      {
        id: "q2",
        title: `${axisMeta.xNegative} ${axisMeta.yPositive}`,
        subtitle: "Economic left, socially authoritarian",
        parties: [],
        totalVotes: 0,
      },
      {
        id: "q3",
        title: `${axisMeta.xNegative} ${axisMeta.yNegative}`,
        subtitle: "Economic left, socially libertarian",
        parties: [],
        totalVotes: 0,
      },
      {
        id: "q4",
        title: `${axisMeta.xPositive} ${axisMeta.yNegative}`,
        subtitle: "Economic right, socially libertarian",
        parties: [],
        totalVotes: 0,
      },
    ];

    const byId = new Map(base.map((item) => [item.id, item]));

    for (const point of chartPoints) {
      const id = getQuadrant(point);
      const quadrant = byId.get(id);
      if (!quadrant) continue;
      quadrant.parties.push(point);
      quadrant.totalVotes += point.votes;
    }

    return base;
  }, [axisMeta, chartPoints]);

  const selectorParties = useMemo(() => {
    const items = parties ?? [];
    return [...items].sort((a, b) => Number(b.vote_count ?? 0) - Number(a.vote_count ?? 0));
  }, [parties]);

  useEffect(() => {
    if (selectedPartyId == null) return;
    if (selectorParties.some((party) => party.id === selectedPartyId)) return;
    setSelectedPartyId(null);
  }, [selectedPartyId, selectorParties]);

  const selectedParty = useMemo(() => {
    if (selectedPartyId == null) return null;
    return selectorParties.find((party) => party.id === selectedPartyId) ?? null;
  }, [selectedPartyId, selectorParties]);

  const partyDeviation = useMemo(() => {
    if (!selectedParty) {
      return {
        strongest: [] as AxisDeviation[],
        weakest: [] as AxisDeviation[],
        partyScore: null as number | null,
        comparableCount: 0,
        totalAxisCount: Object.keys(AXIS_WEIGHTS).length,
        missingCalculated: [] as string[],
        missingPlatform: [] as string[],
      };
    }

    const entries: AxisDeviation[] = [];
    const missingCalculated: string[] = [];
    const missingPlatform: string[] = [];

    for (const [axisCode, weight] of Object.entries(AXIS_WEIGHTS)) {
      const calculated = getPositionForAxis(selectedParty, "calculated", axisCode);
      const platform = getPositionForAxis(selectedParty, "platform", axisCode);

      if (!calculated) missingCalculated.push(weight.label);
      if (!platform) missingPlatform.push(weight.label);
      if (!calculated || !platform) continue;

      const calculatedValue = clampAxisValue(Number(calculated.position_value));
      const platformValue = clampAxisValue(Number(platform.position_value));

      entries.push({
        axisCode,
        axisLabel: weight.label,
        calculatedValue,
        platformValue,
        gap: Math.abs(calculatedValue - platformValue),
        negativePole: calculated.pole_negative_label || platform.pole_negative_label || "Negative pole",
        positivePole: calculated.pole_positive_label || platform.pole_positive_label || "Positive pole",
      });
    }

    const ascending = [...entries].sort((a, b) => {
      if (a.gap !== b.gap) return a.gap - b.gap;
      return a.axisLabel.localeCompare(b.axisLabel);
    });
    const descending = [...entries].sort((a, b) => {
      if (a.gap !== b.gap) return b.gap - a.gap;
      return a.axisLabel.localeCompare(b.axisLabel);
    });

    const strongestCount = Math.ceil(entries.length / 2);
    const strongest = ascending.slice(0, strongestCount);
    const strongestCodes = new Set(strongest.map((entry) => entry.axisCode));
    const weakest = descending.filter((entry) => !strongestCodes.has(entry.axisCode));
    const totalAxisCount = Object.keys(AXIS_WEIGHTS).length;
    const partyScore = computeDeviationScore(
      entries.map((entry) => entry.gap),
      entries.length,
      totalAxisCount,
    );

    return {
      strongest,
      weakest,
      partyScore,
      comparableCount: entries.length,
      totalAxisCount,
      missingCalculated,
      missingPlatform,
    };
  }, [selectedParty]);

  if (nationId == null) {
    return (
      <main className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8">
        <EmptyState message="Select a nation to map party contestation." />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[88rem] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Political Compass</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Condensed 2-axis map for {selectedNation?.name ?? "selected nation"}: left-right on
            X and libertarian-authoritarian on Y, derived from all party ideology categories.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Data source</h2>
              <p className="text-xs text-muted-foreground">
                Toggle between declared platform positions and calculated ideology positions.
              </p>
            </div>
            <div className="w-full md:w-[280px]">
              <Select value={source} onValueChange={(value) => setSource(value as ValueSource)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calculated">Calculated positions</SelectItem>
                  <SelectItem value="platform">Platform positions</SelectItem>
                  <SelectItem value="both">Both positions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {source === "both" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Both series are plotted together. Dashed connectors show how far each party moves
              between calculated and platform positions.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          {error && <p className="text-sm text-destructive">Failed to load parties: {error}</p>}
          {loading && !error && <p className="text-sm text-muted-foreground">Loading parties…</p>}
          {!loading && !error && chartPoints.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No usable compass positions found for the selected data source.
            </p>
          )}

          {!loading && !error && chartPoints.length > 0 && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {source === "both" ? `${chartPoints.length} plotted endpoints` : `${chartPoints.length} plotted parties`}
                </span>
                <span>Axis range: left/right and libertarian/authoritarian</span>
              </div>

              <div className="h-[360px] w-full sm:h-[430px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 24, bottom: 18, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.45} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.45} />
                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={[-1, 1]}
                      ticks={[-1, -0.5, 0, 0.5, 1]}
                      tick={{ fontSize: 12 }}
                      axisLine={{ strokeOpacity: 0.35 }}
                      tickLine={{ strokeOpacity: 0.35 }}
                      label={{
                        value: `${axisMeta.xNegative} <-> ${axisMeta.xPositive}`,
                        position: "bottom",
                        offset: -2,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      domain={[-1, 1]}
                      ticks={[-1, -0.5, 0, 0.5, 1]}
                      tick={{ fontSize: 12 }}
                      axisLine={{ strokeOpacity: 0.35 }}
                      tickLine={{ strokeOpacity: 0.35 }}
                      label={{
                        value: `${axisMeta.yNegative} <-> ${axisMeta.yPositive}`,
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0]?.payload as PartyPoint | undefined;
                        if (!point) return null;
                        return (
                          <div className="rounded-md border border-border bg-background p-2 text-xs shadow-md">
                            <p className="font-semibold text-foreground">{point.name}</p>
                            <p className="text-muted-foreground">{point.abbreviation}</p>
                            <p className="mt-1 text-muted-foreground">Source: {point.sourceLabel}</p>
                            <p className="mt-1 text-muted-foreground">
                              Left-right: <span className="font-mono text-foreground">{fmtAxis(point.x)}</span>
                            </p>
                            <p className="text-muted-foreground">
                              Libertarian-authoritarian: <span className="font-mono text-foreground">{fmtAxis(point.y)}</span>
                            </p>
                            <p className="text-muted-foreground">Votes: {point.votes}</p>
                            <p className="text-muted-foreground">Seats: {point.seats}</p>
                            {source === "both" && (
                              <p className="mt-1 uppercase tracking-wide text-[10px] text-muted-foreground">
                                Connector shown when both sources exist
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    {source === "both" ? (
                      <>
                        <Scatter data={calculatedPoints} shape="circle" fillOpacity={0.1}>
                          {calculatedPoints.map((point) => (
                            <Cell
                              key={`calc-${point.id}`}
                              fill={readableFillColor(point.color)}
                              stroke={readableStrokeColor(point.color)}
                            />
                          ))}
                        </Scatter>
                        <Scatter data={platformPoints} shape="circle" fillOpacity={0.1}>
                          {platformPoints.map((point) => (
                            <Cell
                              key={`plat-${point.id}`}
                              fill={readableFillColor(point.color)}
                              stroke={readableStrokeColor(point.color)}
                            />
                          ))}
                        </Scatter>
                      </>
                    ) : (
                      <Scatter data={points} shape="circle" fillOpacity={0.95}>
                        {points.map((point) => (
                          <Cell
                            key={point.id}
                            fill={readableFillColor(point.color)}
                            stroke={readableStrokeColor(point.color)}
                          />
                        ))}
                        <LabelList dataKey="abbreviation" position="top" content={BlackLabel} />
                      </Scatter>
                    )}
                    {source === "both" && (
                      <Customized
                        component={(props: any) => (
                          <BothPointsLayer
                            calculatedPoints={calculatedPoints}
                            platformPoints={platformPoints}
                            xAxisMap={props?.xAxisMap}
                            yAxisMap={props?.yAxisMap}
                          />
                        )}
                      />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                <span className="rounded-md border border-border px-2 py-1">X-: {axisMeta.xNegative}</span>
                <span className="rounded-md border border-border px-2 py-1">X+: {axisMeta.xPositive}</span>
                <span className="rounded-md border border-border px-2 py-1">Y-: {axisMeta.yNegative}</span>
                <span className="rounded-md border border-border px-2 py-1">Y+: {axisMeta.yPositive}</span>
              </div>

              {source === "both" && (
                <div className="mt-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  Showing {connectorCount} connector{connectorCount === 1 ? "" : "s"} between calculated and platform positions.
                </div>
              )}

              <div className="mt-4 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Axis condensation</p>
                <p className="mt-1">
                  X combines {COMPASS_AXIS_GROUPS.x.join(", ")}. Y combines {COMPASS_AXIS_GROUPS.y.join(", ")}.
                </p>
              </div>
            </>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-foreground">Quadrant concentration</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Quick read of where points cluster across the two fixed axes.
            </p>
            {source === "both" && (
              <p className="mt-1 text-xs text-muted-foreground">
                In both mode, this summary reflects plotted endpoints from both sources.
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {quadrants.map((quadrant) => (
                <article key={quadrant.id} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-foreground">{quadrant.title}</h3>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {quadrant.subtitle}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {source === "both" ? "Endpoints" : "Parties"}: {quadrant.parties.length} | Votes: {quadrant.totalVotes}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {quadrant.parties.length === 0 && (
                      <span className="text-[11px] text-muted-foreground">No parties</span>
                    )}
                    {quadrant.parties.map((party) => (
                      <span
                        key={`${party.id}-${party.source}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px]"
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full border"
                          style={{
                            backgroundColor: readableFillColor(party.color),
                            borderColor: readableStrokeColor(party.color),
                          }}
                          aria-hidden
                        />
                        {party.abbreviation}
                        {source === "both" ? ` - ${party.sourceLabel}` : ""}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-foreground">Party snapshot</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sorted for fast cross-checking.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Party</th>
                    <th className="px-2 py-2 font-medium">Source</th>
                    <th className="px-2 py-2 font-medium">Ideology</th>
                    <th className="px-2 py-2 font-medium">Seats</th>
                  </tr>
                </thead>
                <tbody>
                  {chartPoints.map((point) => (
                    <tr key={`${point.id}-${point.source}`} className="border-b border-border/70">
                      <td className="px-2 py-2">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full border"
                            style={{
                              backgroundColor: readableFillColor(point.color),
                              borderColor: readableStrokeColor(point.color),
                            }}
                            aria-hidden
                          />
                          <span className="font-medium text-foreground">{point.abbreviation}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{point.sourceLabel}</td>
                      <td className="px-2 py-2">
                        <IdeologyGlyph point={point} />
                      </td>
                      <td className="px-2 py-2">{point.seats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {missingAxisParties.length > 0 && (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
                <p className="font-medium">Missing axis data</p>
                <p className="mt-1">
                  Excluded from chart: {missingAxisParties.map((party) => party.abbreviation).join(", ")}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Party Deviation Analysis</h2>
              <p className="text-xs text-muted-foreground">
                Select one party to compare category-by-category gaps between calculated and platform positions.
              </p>
            </div>
            <div className="w-full md:w-[320px]">
              <Select
                value={selectedPartyId == null ? "" : String(selectedPartyId)}
                onValueChange={(value) => setSelectedPartyId(value ? Number(value) : null)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a party" />
                </SelectTrigger>
                <SelectContent>
                  {selectorParties.map((party) => (
                    <SelectItem key={party.id} value={String(party.id)}>
                      {party.name} ({party.abbreviation || party.name.slice(0, 3).toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedParty == null ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No party selected. Choose a party to view strongest alignments and largest deviations.
            </p>
          ) : (
            <>
              <div className="mt-4 flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    {selectedParty.logo_url ? (
                      <span
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border"
                        style={{ backgroundColor: readableFillColor(safeColor(selectedParty.color)) }}
                      >
                        <img
                          src={selectedParty.logo_url}
                          alt={`${selectedParty.name} logo`}
                          className="h-full w-full object-contain"
                        />
                      </span>
                    ) : (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full border"
                        style={{
                          backgroundColor: readableFillColor(safeColor(selectedParty.color)),
                          borderColor: readableStrokeColor(safeColor(selectedParty.color)),
                        }}
                        aria-hidden
                      />
                    )}
                    <span className="truncate font-medium text-foreground">{selectedParty.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {selectedParty.abbreviation || selectedParty.name.slice(0, 3).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    Compared axes: {partyDeviation.comparableCount}/{partyDeviation.totalAxisCount}
                  </span>
                </div>
                <div className="shrink-0 rounded border border-border bg-card px-2 py-1 text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Party score</p>
                  <p className="text-sm font-semibold text-foreground">
                    {partyDeviation.partyScore == null ? "N/A" : `${partyDeviation.partyScore}/100`}
                  </p>
                </div>
              </div>

              {partyDeviation.comparableCount === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  This party does not have enough data in both sources to compute category deviations.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <article className="rounded-md border border-border bg-background p-3">
                    <h3 className="text-xs font-semibold text-foreground">
                      Strongest Alignments
                    </h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Each row uses a mini-axis. Hover an axis for precise values.
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {partyDeviation.strongest.map((entry) => (
                        <div
                          key={`strong-${entry.axisCode}`}
                          className="flex items-center justify-between gap-3 rounded border border-border/80 px-2 py-1.5 text-[11px]"
                        >
                          <p className="font-medium text-foreground">{entry.axisLabel}</p>
                          <AxisDeviationGlyph entry={entry} />
                        </div>
                      ))}
                    </div>
                    </article>

                    <article className="rounded-md border border-border bg-background p-3">
                    <h3 className="text-xs font-semibold text-foreground">
                      Largest Deviations
                    </h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Each row uses a mini-axis. Hover an axis for precise values.
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {partyDeviation.weakest.map((entry) => (
                        <div
                          key={`weak-${entry.axisCode}`}
                          className="flex items-center justify-between gap-3 rounded border border-border/80 px-2 py-1.5 text-[11px]"
                        >
                          <p className="font-medium text-foreground">{entry.axisLabel}</p>
                          <AxisDeviationGlyph entry={entry} />
                        </div>
                      ))}
                    </div>
                    </article>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-4 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-full border border-slate-900 bg-slate-900" aria-hidden />
                      Calculated
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-slate-900 bg-white" aria-hidden />
                      Platform
                    </span>
                  </div>
                </>
              )}

              {(partyDeviation.missingCalculated.length > 0 || partyDeviation.missingPlatform.length > 0) && (
                <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
                  <p className="font-medium">Partial category coverage</p>
                  {partyDeviation.missingCalculated.length > 0 && (
                    <p className="mt-1">
                      Missing in calculated: {partyDeviation.missingCalculated.join(", ")}
                    </p>
                  )}
                  {partyDeviation.missingPlatform.length > 0 && (
                    <p className="mt-1">
                      Missing in platform: {partyDeviation.missingPlatform.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
