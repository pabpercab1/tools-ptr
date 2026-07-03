import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM =
  (import.meta.env.VITE_UPSTREAM_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "https://api.ptr.zanz2.dev";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/ptr/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request, params }) => {
        const rest = (params as { _splat?: string })._splat ?? "";
        const url = new URL(request.url);
        const target = `${UPSTREAM}/api/${rest}${url.search}`;
        const headers: Record<string, string> = { accept: "application/json" };
        const auth = request.headers.get("authorization");
        if (auth) headers.authorization = auth;
        try {
          const upstream = await fetch(target, { headers });
          const body = await upstream.text();
          return new Response(body, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") ?? "application/json",
              "Cache-Control": auth ? "private, no-store" : "public, max-age=60",
              ...cors,
            },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
      },
    },
  },
});
