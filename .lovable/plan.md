## Export chart as image (PNG / JPG)

Add an "Export" control above both the polling BarChart (Voting intention + Projected seats modes) and the ParliamentChart (Estimate parliament mode) that downloads the chart as an image, with an option to include or exclude the legend.

### Changes

1. **Dependency**: add `html-to-image` (small, works well with the existing SVG + HTML/Tailwind bars — better than `html2canvas` for our SVG hemicycle).

2. **`src/routes/index.tsx`**
   - Wrap each chart in an outer container with two nested refs:
     - `fullRef` — chart + legend + party labels (full export)
     - `chartOnlyRef` — chart body only (bars/hemicycle + axis + party labels, no legend/header)
   - Add a small toolbar above each chart:
     - Format toggle: `PNG | JPG`
     - Checkbox: `Include legend`
     - Button: `Export` — triggers download of `poll-<nation>-<gameMonth>-<mode>.png/jpg`
   - Use `toPng` / `toJpeg` from `html-to-image` at 2× pixel ratio with a white background for clean output.
   - For JPG, flatten with white background; PNG stays transparent-safe on white card.

3. **BarChart / ParliamentChart signature**
   - Add an optional `exportSlot` prop (a header node) OR keep the toolbar in the parent and pass a `ref` into the chart. Simplest: parent owns the toolbar and refs, chart components accept a `forwardRef`-style outer `ref` on their root and expose a `data-export-legend` wrapper internally around the legend so the "exclude legend" mode can hide it via a temporary class before capture.

   Implementation detail: on export, if "Include legend" is off, temporarily add a class that sets `display:none` on the legend node inside the ref, snapshot, then restore. No structural refactor of the chart components needed.

### Notes
- File name pattern: `ptr-<nation-slug>-<gameMonth>-<viewMode>.<ext>`.
- Buttons disabled when no poll is loaded.
- No changes to Majority or Members pages.
