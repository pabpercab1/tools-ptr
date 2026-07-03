# Discord OAuth Setup

This tools project reuses the same Supabase project as the main PR:R app (`vsajmskrbiyauigzyiof.supabase.co`). Discord authentication is already configured there, so we inherit the same setup.

## What's Already Done

- The frontend code is implemented in `src/lib/ptr-auth.tsx` and `src/components/SignInBadge.tsx`
- Discord OAuth redirects to Supabase, which then redirects back to the app
- Session tokens are stored in localStorage and persisted across page refreshes

## What Needs to Be Done

Ask the Supabase admin (whoever manages the PR:R backend) to add this tools app's domain to the **Redirect URLs allowlist** in Supabase.

### Steps for the Supabase Admin

1. Go to **Supabase Dashboard** → Select project `vsajmskrbiyauigzyiof`
2. Navigate to **Authentication** → **URL Configuration**
3. Under **Redirect URLs**, add your tools app domain:
   - For production: `https://<your-tools-app-domain>`
   - For local development: `http://localhost:3000` (or your dev port)

4. Click **Save**

**Why:** Supabase's OAuth flow checks that the `redirect_to` parameter matches an approved URL before completing the authentication. Without your domain in this list, the OAuth callback will fail with a validation error.

## How Discord OAuth Works Here

1. User clicks "Continue with Discord" button
2. App redirects to: `https://vsajmskrbiyauigzyiof.supabase.co/auth/v1/authorize?provider=discord&redirect_to=<YOUR_DOMAIN>`
3. User authenticates with Discord
4. Discord redirects back to Supabase with an authorization code
5. Supabase exchanges the code for tokens and redirects back to `<YOUR_DOMAIN>#access_token=...&refresh_token=...`
6. App parses the hash, fetches user email, and stores the session in localStorage

## Implementation Details

- **File:** `src/lib/ptr-auth.tsx`
  - `loginWithDiscord()` — initiates the OAuth flow
  - `fetchOAuthUser()` — retrieves the user's email from Supabase after OAuth
  - OAuth callback parsing happens in the `PtrAuthProvider` init `useEffect`

- **File:** `src/components/SignInBadge.tsx`
  - "Continue with Discord" button in the sign-in modal
  - Uses the same session context as email/password login

## Testing Locally

For local development, you'll also need `http://localhost:<PORT>` in the Redirect URLs list. The exact port depends on your Vite config.

## Notes

- No additional Client ID or credentials needed — they're already in Supabase
- The Discord app itself is registered in Discord's Developer Portal and linked to Supabase
- This is all handled server-side by Supabase; the frontend just uses the redirect flow

## Optional Environment Override

If you need Discord OAuth to always redirect to a fixed URL (instead of the current browser origin), set:

- `VITE_DISCORD_REDIRECT_TO=https://your-domain.example`
- `VITE_DISCORD_LOGIN_ENABLED=true` (default is disabled)

If you need to target a different Supabase project URL, set:

- `VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co`

When this variable is not set, the app defaults to `window.location.origin`.

Discord login visibility and behavior are controlled by `VITE_DISCORD_LOGIN_ENABLED`.
Accepted true values are `true`, `1`, and `yes`. Any other value (or unset) disables Discord login.
