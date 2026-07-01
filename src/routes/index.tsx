import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type Nation = { id: number; name: string };
type NationWithFlag = Nation & { flagUrl: string | null };

async function fetchFlag(id: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/ptr/nations/${id}/law-states`);
    if (!res.ok) return null;
    const data = await res.json();
    const categories: any[] = Array.isArray(data) ? data : data.categories ?? [];
    for (const cat of categories) {
      const laws: any[] = cat.laws ?? [];
      for (const law of laws) {
        const name = String(law.law_name ?? "").toLowerCase();
        if (name.includes("national flag")) {
          const v = String(law.current_value ?? "").trim();
          if (v.startsWith("http")) return v;
        }
      }
    }
  } catch {}
  return null;
}

function HomePage() {
  const [nations, setNations] = useState<NationWithFlag[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ptr/nations");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list: Nation[] = await res.json();
        const enriched = await Promise.all(
          list.map(async (n) => ({ ...n, flagUrl: await fetchFlag(n.id) })),
        );
        if (!cancelled) setNations(enriched);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">PR:R Tools</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A small collection of tools for the PR:R (Politics &amp; Roleplay) universe: visualise
          fictional election polling in a EuropeElects style, compute parliamentary majorities,
          and browse party members across nations. Data comes live from{" "}
          <code className="text-xs">api.ptr.zanz2.dev</code>.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tools</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <ToolCard to="/polls" title="Polling" desc="Visualise national polls, projected seats and D'Hondt parliament estimates." />
          <ToolCard to="/majority" title="Majority calculator" desc="Simulate Yes / Abstain / No votes to check simple, absolute and supermajorities." />
          <ToolCard to="/members" title="Members" desc="Browse party internal positions and political figures (sign-in required)." />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Available countries
        </h2>
        {err && <p className="text-sm text-destructive">Failed to load nations: {err}</p>}
        {!nations && !err && (
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 rounded-md border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}
        {nations && (
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {nations.map((n) => (
              <div
                key={n.id}
                className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-3"
              >
                <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-sm border border-border bg-white">
                  {n.flagUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.flagUrl}
                      alt={`Flag of ${n.name}`}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">No flag</span>
                  )}
                </div>
                <div className="text-xs font-medium text-foreground text-center">{n.name}</div>
              </div>
            ))}
            {nations.length === 0 && (
              <p className="text-sm text-muted-foreground">No nations available.</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ToolCard({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="block rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/40"
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</div>
    </Link>
  );
}
