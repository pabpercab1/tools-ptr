## Goal
Replace the bar chart used for "Estimate parliament" mode with a proper hemicycle (parliament) chart, while keeping the bar chart for "Voting intention" and "Projected seats" modes.

## Library
Use `d3-parliament-chart` (npm: `d3-parliament-chart`) together with `d3` (already a peer). It renders an SVG hemicycle of seat dots — clean, minimal, fits the data-journalism aesthetic.

- Install: `bun add d3 d3-parliament-chart`
- Types: `bun add -d @types/d3`

## Component
New file `src/components/ParliamentChart.tsx`:
- Props: `seats: { partyId: number; abbr: string; name: string; color: string; seats: number }[]`, `totalSeats: number`.
- Sort parties left-to-right by a stable political ordering — since the API has no left/right axis, sort by descending seat count (largest party center) — matches Europe Elects' approach when no spectrum is supplied. (Open to alternative ordering if you prefer.)
- Expand into a flat array of `{ color }` seat entries and feed to `d3-parliament-chart`.
- Render inside a ref'd `<div>`; redraw on prop change; responsive width via `ResizeObserver`.
- Below the hemicycle: a compact legend grid (color swatch + abbr + seat count), sorted by seats desc.

## Wire-up in `src/routes/index.tsx`
- In the render branch for `mode === "estimate"`:
  - Keep the existing note ("Estimated seats based on current poll at …") and the threshold/total-seats inputs.
  - Replace the `<BarChart>` call with `<ParliamentChart>` using `rows` filtered to `projected_seats > 0` and `estTotalSeats`.
  - Keep the "no party clears threshold" empty state.
- Leave `BarChart` untouched for `poll` and `seats` modes.
- Hide the "Show previous election" toggle in estimate mode (already effectively unused there).

## Technical notes
- `d3-parliament-chart` is plain JS; no SSR concerns since the route renders client-side after data fetch, but guard the d3 render inside `useEffect` so it only runs in the browser.
- Fallback color `#999999` already handled upstream.

## Out of scope
- No changes to data fetching, D'Hondt logic, snapshots, or other modes.
