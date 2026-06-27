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

    // Heuristic seat radius so most parliaments fit cleanly.
    const seatRadius = Math.max(
      3,
      Math.min(9, Math.floor(width / Math.max(40, Math.sqrt(flat.length) * 9))),
    );
    const rowHeight = seatRadius * 2.4;

    const chart = parliamentChart()
      .width(width)
      .sections(4)
      .sectionGap(seatRadius * 1.5)
      .seatRadius(seatRadius)
      .rowHeight(rowHeight);

    const height = Math.ceil(width / 2) + 8;
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("height", height);

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
