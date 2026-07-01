## Add government status badges to polling bar chart

Fetch the current government for the selected nation and annotate each party bar in the polling view with a small label under its acronym: **Govt** for parties with members in `government.members`, **Supp** for parties listed in `government.confidence_partners`.

### Changes

1. **`src/routes/index.tsx`**
   - Add a `useQuery`/effect that fetches `/api/ptr/nations/{nationId}/government` when the nation changes. Build a `Map<partyId, "govt" | "supp">` (Govt wins if a party appears in both).
   - Pass this map into `BarChart` as a new `govStatus` prop.

2. **`BarChart` component (in the same file)**
   - Under the abbreviation label on each vertical bar, render a tiny secondary line: `Govt` or `Supp` (uppercase small caps, ~10px, muted color). Nothing rendered if the party isn't in either set.
   - Applies to both "Voting intention" and "Projected seats" views (same bar layout). The "Estimate parliament" hemicycle is unchanged.

### Notes
- Endpoint is public, so no auth header needed — reuse the existing `/api/ptr` proxy.
- Gracefully handle 404 / no active government (empty map → no badges).
