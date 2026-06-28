import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
// @ts-expect-error - no types shipped
import { parliamentChart } from "d3-parliament-chart";

const FALLBACK_COLOR = "#999999";

export type ParliamentSeat = {
  partyId: number;
  abbr: string;
  name: string;
  color: string;
  seats: number;
};

type Props = {
  seats: ParliamentSeat[];
  totalSeats: number;
};

function orderForHemicycle(parties: ParliamentSeat[]): ParliamentSeat[] {
  const sorted = [...parties].sort((a, b) => b.seats - a.seats);
  const left: ParliamentSeat[] = [];
  const right: ParliamentSeat[] = [];
  sorted.forEach((p, i) => {
    if (i % 2 === 0) right.push(p);
    else left.push(p);
  });
  return [...left.reverse(), ...right];
}

// Auto-fit: pick section count and geometry so the hemicycle fills the
// available width without leaving an oversized empty centre.
function autoParams(N: number, containerWidth: number) {
  const drawWidth = Math.min(
    containerWidth,
    Math.max(360, Math.round(Math.sqrt(Math.max(1, N)) * 55)),
  );
  const R = drawWidth / 2;
  const rawSections = Math.max(1, Math.min(9, Math.round(Math.sqrt(N) / 5)));
  const sections =
    N % 2 === 0
      ? rawSections % 2 === 0
        ? rawSections
        : Math.max(2, rawSections + 1)
      : rawSections % 2 === 1
        ? rawSections
        : rawSections + 1;
  const seatRadius = Math.max(
    3,
    Math.min(14, Math.round((0.4 * R) / Math.sqrt(Math.max(1, N)))),
  );
  const rowHeight = Math.max(seatRadius * 2 + 1, Math.round(seatRadius * 2.33));
  const sectionGap = Math.max(4, Math.round(seatRadius * 2.89));
  return { drawWidth, sections, seatRadius, rowHeight, sectionGap };
}

type Settings = {
  auto: boolean;
  sections: number;
  seatRadius: number;
  rowHeight: number;
  sectionGap: number;
};

type EffectiveSettings = Settings & { drawWidth: number };

export function ParliamentChart({ seats, totalSeats }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(640);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    auto: true,
    sections: 5,
    seatRadius: 9,
    rowHeight: 21,
    sectionGap: 26,
  });

  const N = useMemo(
    () => seats.filter((s) => s.seats > 0).reduce((s, p) => s + p.seats, 0),
    [seats],
  );

  const effectiveSettings = useMemo<EffectiveSettings>(() => {
    const auto = autoParams(N, width);
    if (!settings.auto) return { ...settings, drawWidth: auto.drawWidth };
    return { ...settings, ...auto, drawWidth: auto.drawWidth };
  }, [settings, N, width]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(280, Math.floor(e.contentRect.width));
        setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const ordered = orderForHemicycle(seats.filter((s) => s.seats > 0));
    const flat: { color: string }[] = [];
    for (const p of ordered) {
      for (let i = 0; i < p.seats; i++) flat.push({ color: p.color || FALLBACK_COLOR });
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (flat.length === 0) return;

    const { drawWidth, sections, seatRadius, rowHeight, sectionGap } = effectiveSettings;

    const chart = parliamentChart()
      .width(drawWidth)
      .sections(Math.max(1, sections))
      .sectionGap(sectionGap)
      .seatRadius(seatRadius)
      .rowHeight(rowHeight);

    const height = Math.ceil(drawWidth / 2) + Math.ceil(seatRadius * 2);
    svg
      .attr("viewBox", `0 0 ${drawWidth} ${height}`)
      .attr("width", "100%")
      .attr("preserveAspectRatio", "xMidYMin meet")
      .style("max-width", `${drawWidth}px`)
      .style("display", "block")
      .style("margin", "0 auto");

    const g = svg.append("g");
    g.call(chart.data(flat));
    g.selectAll("circle")
      .attr("fill", (d: unknown) => (d as { color: string }).color)
      .attr("stroke", (d: unknown) => {
        const c = (d as { color: string }).color;
        const h = c.replace("#", "");
        const f = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
        const r = parseInt(f.slice(0, 2), 16);
        const gg = parseInt(f.slice(2, 4), 16);
        const b = parseInt(f.slice(4, 6), 16);
        const luma = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
        return luma > 0.92 ? "#94a3b8" : "#ffffff";
      })
      .attr("stroke-width", 0.75);
  }, [seats, width, effectiveSettings]);

  const legend = [...seats].filter((s) => s.seats > 0).sort((a, b) => b.seats - a.seats);
  const allocated = legend.reduce((s, p) => s + p.seats, 0);

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute right-0 top-0 z-10">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Edit chart settings"
            title="Edit chart settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {settingsOpen && (
            <div className="mt-1 w-60 rounded-md border border-border bg-background shadow-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Chart settings</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-foreground cursor-pointer"
                    checked={settings.auto}
                    onChange={(e) => setSettings((s) => ({ ...s, auto: e.target.checked }))}
                  />
                  Auto-fit
                </label>
              </div>
              <Field label="Sections">
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  disabled={settings.auto}
                  value={effectiveSettings.sections}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, sections: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="h-7 w-16 rounded border border-input bg-background px-1.5 text-right tabular-nums disabled:opacity-50"
                />
              </Field>
              <Field label="Seat radius">
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={settings.auto}
                  value={effectiveSettings.seatRadius}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, seatRadius: Math.max(1, Math.round(Number(e.target.value) || 1)) }))
                  }
                  className="h-7 w-16 rounded border border-input bg-background px-1.5 text-right tabular-nums disabled:opacity-50"
                />
              </Field>
              <Field label="Row height">
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={settings.auto}
                  value={effectiveSettings.rowHeight}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, rowHeight: Math.max(1, Math.round(Number(e.target.value) || 1)) }))
                  }
                  className="h-7 w-16 rounded border border-input bg-background px-1.5 text-right tabular-nums disabled:opacity-50"
                />
              </Field>
              <Field label="Section gap">
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={settings.auto}
                  value={effectiveSettings.sectionGap}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, sectionGap: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  className="h-7 w-16 rounded border border-input bg-background px-1.5 text-right tabular-nums disabled:opacity-50"
                />
              </Field>
            </div>
          )}
        </div>
        <div ref={containerRef} className="w-full pt-2">
          <svg ref={svgRef} />
        </div>
      </div>
      <div className="text-center text-xs text-muted-foreground">
        {allocated} of {totalSeats} seats allocated
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4 text-xs">
        {legend.map((p) => (
          <div key={p.partyId} className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-border shrink-0"
              style={{ backgroundColor: p.color || FALLBACK_COLOR }}
            />
            <span className="font-medium truncate">{p.abbr}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{p.seats}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
