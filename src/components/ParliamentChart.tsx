import { useEffect, useRef, useState } from "react";
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

// Order seats left-to-right: by descending seat count, alternating sides so
// the largest party sits in the centre. Without a left/right axis from the
// API this matches Europe Elects' default presentation.
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

export function ParliamentChart({ seats, totalSeats }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(640);

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

    const N = flat.length;
    // Cap the drawn width for small parliaments so the hemicycle stays dense
    // instead of becoming a thin arc with a huge empty centre.
    const drawWidth = Math.min(width, Math.max(360, Math.round(Math.sqrt(N) * 55)));
    const R = drawWidth / 2;
    // Seat radius chosen so the rows fill the full radius (no empty middle).
    // Derived from capacity ≈ 0.3 * R^2 / r^2 ≈ N.
    const seatRadius = Math.max(
      2.5,
      Math.min(11, (R * 0.55) / Math.sqrt(Math.max(1, N))),
    );
    const rowHeight = seatRadius * 2.25;

    const chart = parliamentChart()
      .width(drawWidth)
      .sections(1)
      .sectionGap(0)
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
  }, [seats, width, totalSeats]);

  const legend = [...seats].filter((s) => s.seats > 0).sort((a, b) => b.seats - a.seats);
  const allocated = legend.reduce((s, p) => s + p.seats, 0);

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="w-full">
        <svg ref={svgRef} />
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
