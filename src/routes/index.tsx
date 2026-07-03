import { createFileRoute, Link } from "@tanstack/react-router";
import { useNation } from "@/lib/nation-context";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { nations, nationsErr, nationId, setNationId } = useNation();

  return (
    <main className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-10 flex items-start gap-6">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">PR:R Tools</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            A small collection of tools for PR:R: visualise election polling, create estimates, download the charts, compute parliamentary majorities, and browse party members across nations. Data comes live from <code className="text-xs">api.ptr.zanz2.dev</code>.
          </p>
        </div>
        <img src={logo} alt="PR:R Logo" className="h-20 w-auto flex-shrink-0 object-contain" />
      </header>

      <section className="mb-12">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ToolCard to="/polls" title="Polling" desc="Visualise national polls, projected seats and D'Hondt parliament estimates." />
          <ToolCard to="/majority" title="Majority calculator" desc="Simulate Yes / Abstain / No votes to check simple, absolute and supermajorities." />
          <ToolCard to="/members" title="Members" desc="Browse party internal positions and political figures (sign-in required)." />
          <ToolCard to="/party-primary" title="Party Primary" desc="Model internal party elections with factions, turnout, and ranked-choice rounds." />
          <ToolCard to="/political-contestation" title="Political Compass" desc="Condense all party ideology categories into a left-right / libertarian-authoritarian map." />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Available countries
        </h2>
        {nationsErr && <p className="text-sm text-destructive">Failed to load nations: {nationsErr}</p>}
        {!nations && !nationsErr && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 rounded-md border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}
        {nations && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {nations.map((n) => (
              <button
                type="button"
                key={n.id}
                onClick={() => setNationId(n.id)}
                className={`flex flex-col items-center gap-2 rounded-md border bg-card p-3 text-left transition-colors hover:border-foreground/40 ${
                  nationId === n.id ? "border-foreground ring-1 ring-foreground/20" : "border-border"
                }`}
              >
                <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-sm bg-white">
                  {n.flagUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.flagUrl}
                      alt={`Flag of ${n.name}`}
                      className="max-h-full max-w-full object-contain border border-border rounded-sm"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">No flag</span>
                  )}
                </div>
                <div className="text-xs font-medium text-foreground text-center">{n.name}</div>
              </button>
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
