## Goal
Add a **Members** tool (party people + internal positions) and lift the **Nation** selector into the global top nav. Authenticated PTR endpoints get reached through a server-side login flow that never exposes credentials to the browser.

## 1. Server-side auth for the PTR API

The upstream `/api/parties/{id}/political-figures` endpoint requires `Authorization: Bearer <jwt>`. The token is minted by the PTR project's Supabase auth endpoint, which itself needs an `apikey` header (the Supabase anon key). Both the email/password and the anon key stay server-side.

**Secrets to add (one-time, via the secure form):**
- `PTR_AUTH_EMAIL` — the login email
- `PTR_AUTH_PASSWORD` — the password
- `PTR_SUPABASE_ANON_KEY` — anon/publishable key for `vsajmskrbiyauigzyiof.supabase.co` (needed as the `apikey` header on the token endpoint)

**New `src/lib/ptr-auth.server.ts`:**
- `getPtrAccessToken()` returns a cached JWT.
- On first call (or when cached token is within 60s of `expires_at`), POSTs to
  `https://vsajmskrbiyauigzyiof.supabase.co/auth/v1/token?grant_type=password`
  with `apikey: PTR_SUPABASE_ANON_KEY`, `content-type: application/json`, body `{ email, password }`. Stores `{access_token, expires_at}` in a module-level variable.
- If a downstream call returns 401, the proxy clears the cache and retries the login once (handles token rotation / refresh-token expiry).
- Note: the Worker runtime is stateless across cold starts, so the cache is best-effort per instance — that's fine, login is cheap and bounded.

**Update `src/routes/api/ptr.$.ts`:**
- Before proxying, import `getPtrAccessToken` and add `Authorization: Bearer <token>` to the outbound request headers.
- On a 401 from upstream, refresh once and replay the request.
- Keep the existing CORS headers and 60s cache.
- The bearer is only ever in the server → upstream hop; never returned to the browser.

This single change unblocks the political-figures endpoint and any other authenticated PTR endpoint we add later — pages keep calling `/api/ptr/...` unchanged.

## 2. Shared Nation selector in the top nav

Currently `index.tsx` and `majority.tsx` each fetch `/nations` and render their own dropdown. Lift to root.

- New `src/lib/nation-context.tsx` — React context + provider that:
  - fetches `/api/ptr/nations` once,
  - holds `nationId` persisted in `localStorage` as `ptr.nationId` (default = first nation),
  - exposes `{ nations, nationId, setNationId, loading, error }`.
- `src/routes/__root.tsx`:
  - Wrap `<Outlet />` with `<NationProvider>`.
  - Add a compact `<NationSelect />` (white dropdown, thin border, same sans-serif) to the top-right of the existing nav bar, with `ml-auto` so it sits opposite the page links.
  - Add a "Members" `<Link to="/members">` next to Polling / Majority calculator.
- `src/routes/index.tsx` and `src/routes/majority.tsx`:
  - Delete the local Nation `<section>` + `nations`/`nationsErr`/`nationId` state; replace with `const { nationId } = useNation();`. Existing `useEffect`s keyed on `nationId` keep working.

## 3. New route `src/routes/members.tsx`

- `head()` title `"Members — PR:R Tools"`.
- Reads `nationId` from `useNation()`.
- Fetches `/api/ptr/parties?nation_id={id}&active_only=true` and shows two columns:

**Left — party list** (same row style as polling/majority tables: 20×20 squared logo with party-color background, `borderForColor` fallback, abbreviation + full name, seat_count muted). Clicking selects; first party auto-selected.

**Right — selected party detail:**
- Header: bigger version of the same logo box, party name + abbreviation, color swatch, seat_count, vote_count, owner_display_name, optional "Presidential candidate" badge if the parties payload surfaces one (will check the field name during build).
- **Internal positions** — `GET /api/ptr/parties/{party_id}/positions`. Render each `{title, current_holder.name}` ordered by `display_order`. Empty state copy: "No internal positions defined."
- **Members** — `GET /api/ptr/parties/{party_id}/political-figures` (now reachable via the proxy). Card/row for each figure with `image_url` (fallback to a colored initials box in the same squared style), `name`, and `status_badges.primary` / `minister_label` if present. Sort: position-holders first (cross-referenced from positions), then by surname. Top-bar search filter. "Include deceased" switch re-fetches with `?include_dead=true`.
- Clicking a member opens a side panel / modal with `GET /api/ptr/nations/{nation_id}/political-figures/{figure_id}` — description, wiki link, charisma, experience, positions_held, cabinet/HoS history. Read-only.

Loading + error states match existing pages. Two-column on `sm+`, stacked on mobile (party list collapses to a compact select).

## 4. Out of scope
- No editing of parties, figures, or positions.
- No persistence beyond the `nationId` localStorage entry.
- No new charts/timelines for members.

## Open questions
1. The Supabase anon key for `vsajmskrbiyauigzyiof.supabase.co` — do you have it handy, or should I treat it as part of the `add_secret` step alongside email/password? (Needed as the `apikey` header on the login call; without it the token endpoint returns 401.)
2. Nation selector cosmetics: just the nation name, or also a small flag/emoji if the API has one? Default: name only.
