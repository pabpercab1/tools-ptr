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

// Auto-fit: derive seat radius from capacity formula so rows fill the radius.
function autoParams(N: number, containerWidth: number, sections: number) {
  const drawWidth = Math.min(
    containerWidth,
    Math.max(360, Math.round(Math.sqrt(Math.max(1, N)) * 55)),
  );
  const R = drawWidth / 2;
  // Larger section count reduces effective capacity; compensate slightly.
  const sectionPenalty = 1 + (sections - 1) * 0.08;
  const seatRadius = Math.max(
    2.5,
    Math.min(12, ((R * 0.55) / Math.sqrt(Math.max(1, N))) * sectionPenalty),
  );
  const rowHeight = seatRadius * 2.25;
  const sectionGap = sections > 1 ? Math.max(4, Math.round(seatRadius * 1.4)) : 0;
  return { drawWidth, seatRadius, rowHeight, sectionGap };
}

type Settings = {
  auto: boolean;
  sections: number;
  seatRadius: number;
  rowHeight: number;
  sectionGap: number;
};

export function ParliamentChart({ seats, totalSeats }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(640);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    auto: true,
    sections: 4,
    seatRadius: 7,
    rowHeight: 16,
    sectionGap: 10,
  });

  const N = useMemo(
    () => seats.filter((s) => s.seats > 0).reduce((s, p) => s + p.seats, 0),
    [seats],
  );

  // Keep manual defaults synced with auto values until user edits them.
  useEffect(() => {
    if (!settings.auto) return;
    const a = autoParams(N, width, settings.sections);
    setSettings((prev) =>
      prev.auto
        ? {
            ...prev,
            seatRadius: Number(a.seatRadius.toFixed(2)),
            rowHeight: Number(a.rowHeight.toFixed(2)),
            sectionGap: a.sectionGap,
          }
        : prev,
    );
  }, [N, width, settings.auto, settings.sections]);

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

    const a = autoParams(flat.length, width, settings.sections);
    const drawWidth = a.drawWidth;
    const seatRadius = settings.auto ? a.seatRadius : settings.seatRadius;
    const rowHeight = settings.auto ? a.rowHeight : settings.rowHeight;
    const sectionGap = settings.auto ? a.sectionGap : settings.sectionGap;

    const chart = parliamentChart()
      .width(drawWidth)
      .sections(Math.max(1, settings.sections))
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
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 0.5);
  }, [seats, width, settings]);

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
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
                  value={settings.sections}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, sections: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="h-7 w-16 rounded border border-input bg-background px-1.5 text-right tabular-nums"
                />
              </Field>
              <Field label="Seat radius">
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  disabled={settings.auto}
                  value={settings.seatRadius}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, seatRadius: Number(e.target.value) || 1 }))
                  }
                  className="h-7 w-16 rounded border border-input bg-background px-1.5 text-right tabular-nums disabled:opacity-50"
                />
              </Field>
              <Field label="Row height">
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  disabled={settings.auto}
                  value={settings.rowHeight}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, rowHeight: Number(e.target.value) || 1 }))
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
                  value={settings.sectionGap}
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
