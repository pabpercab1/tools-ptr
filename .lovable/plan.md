Use the uploaded gold PTR logo as the app favicon and in the top navigation bar.

## Implementation steps
1. Create a Lovable CDN asset from the uploaded PNG (`user-uploads://0ca4f205-ab99-4192-afc6-056de29f202a.png`) so it can be referenced without storing the binary in the repo.
2. Update `src/routes/__root.tsx`:
   - Replace the default `favicon.ico` head link with the new asset URL.
   - Insert the logo image to the left of the "PR:R Tools" text in the top nav, sized to fit the bar height (≈28px).
3. Delete the stale `public/favicon.ico` file.
4. Verify the build and preview still load correctly.