import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import logoUrl from "../assets/logo.png";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PtrAuthProvider } from "../lib/ptr-auth";
import { NationProvider, useNation } from "../lib/nation-context";
import { SignInBadge } from "../components/SignInBadge";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#1f2937" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "PR:R Tools" },
      { title: "PR:R Tools" },
      { name: "description", content: "Set of tools for PT:R" },
      { property: "og:title", content: "PR:R Tools" },
      { property: "og:description", content: "Set of tools for PT:R" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "PR:R Tools" },
      { name: "twitter:description", content: "Set of tools for PT:R" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/67c0d378-ba1f-4330-9ad6-bc22ad0c53b8/id-preview-72e66e07--6c00a686-2508-4902-aede-a739dd2a6e4f.lovable.app-1782560779500.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/67c0d378-ba1f-4330-9ad6-bc22ad0c53b8/id-preview-72e66e07--6c00a686-2508-4902-aede-a739dd2a6e4f.lovable.app-1782560779500.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
      { rel: "icon", type: "image/png", href: logoUrl },
      { rel: "apple-touch-icon", href: "/icons/pwa-192.svg" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // In dev, stale service workers can cache older route bundles and break hydration.
    if (import.meta.env.DEV) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PtrAuthProvider>
        <NationProvider>
          <nav className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <div className="px-3 sm:px-6">
              <div className="flex flex-col md:flex-row md:items-stretch md:h-11">

                {/* Logo + title */}
                <div className="flex items-center gap-2 shrink-0 py-2 md:py-0 md:pr-4">
                  <img src={logoUrl} alt="PR:R Tools" className="h-6 w-6 rounded-sm" />
                  <span className="text-sm font-semibold tracking-tight text-foreground">PR:R Tools</span>
                </div>

                {/* Nav links – stretch to full nav height so border-b aligns with nav bottom */}
                <div className="flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-1 md:overflow-visible">
                  {(
                    [
                      { to: "/", label: "Home" },
                      { to: "/polls", label: "Polling" },
                      { to: "/majority", label: "Majority calculator" },
                      { to: "/members", label: "Members" },
                      { to: "/party-primary", label: "Party Primary" },
                      { to: "/political-contestation", label: "Political Compass" },
                    ] as const
                  ).map(({ to, label }) => (
                    <Link
                      key={to}
                      to={to}
                      activeOptions={to === "/" ? { exact: true } : undefined}
                      activeProps={{ className: "text-foreground border-foreground" }}
                      inactiveProps={{ className: "text-muted-foreground border-transparent hover:text-foreground" }}
                      className="shrink-0 text-xs font-medium px-2.5 flex items-center border-b-2 transition-colors mb-[-1px]"
                    >
                      {label}
                    </Link>
                  ))}
                </div>

                {/* Nation picker + sign in */}
                <div className="flex flex-wrap items-center gap-2 pb-2 md:pb-0 md:ml-auto md:flex-nowrap">
                  <div className="w-full sm:w-auto sm:min-w-[190px] md:w-auto">
                    <NationPicker />
                  </div>
                  <SignInBadge />
                </div>

              </div>
            </div>
          </nav>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </NationProvider>
      </PtrAuthProvider>
    </QueryClientProvider>
  );
}

function NationPicker() {
  const { nations, nationsErr, nationId, selectedNation, setNationId } = useNation();
  if (nationsErr) {
    return <span className="text-xs text-destructive">Nations failed</span>;
  }
  if (!nations) {
    return <span className="text-xs text-muted-foreground">Loading…</span>;
  }
  return (
    <Select
      value={nationId != null ? String(nationId) : "__none__"}
      onValueChange={(value) => setNationId(value === "__none__" ? null : Number(value))}
    >
      <SelectTrigger aria-label="Nation" className="h-7 w-full sm:w-[175px] gap-1.5 px-2 text-xs">
        {selectedNation ? (
          <div className="flex min-w-0 items-center gap-2">
            <FlagPreview flagUrl={selectedNation.flagUrl} nationName={selectedNation.name} />
            <span className="truncate">{selectedNation.name}</span>
          </div>
        ) : (
          <SelectValue placeholder="Select nation" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Select nation</SelectItem>
        {nations.map((nation) => (
          <SelectItem key={nation.id} value={String(nation.id)}>
            <span className="flex items-center gap-2">
              <FlagPreview flagUrl={nation.flagUrl} nationName={nation.name} />
              <span>{nation.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FlagPreview({
  flagUrl,
  nationName,
}: {
  flagUrl: string | null;
  nationName: string;
}) {
  return (
    <span
      className="inline-flex h-[13px] w-[19px] shrink-0 overflow-hidden rounded-[2px] border border-border bg-muted"
      aria-hidden={!flagUrl}
    >
      {flagUrl && (
        <img
          src={flagUrl}
          alt={`Flag of ${nationName}`}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}

