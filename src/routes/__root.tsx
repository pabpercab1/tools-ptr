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
import { MoreHorizontal } from "lucide-react";

import appCss from "../styles.css?url";
import logoUrl from "../assets/logo.png";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
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

const NAV_ITEMS = [
  { to: "/", label: "Home", exact: true },
  { to: "/polls", label: "Polling" },
  { to: "/majority", label: "Majority Calculator" },
  { to: "/members", label: "Members" },
  { to: "/party-primary", label: "Party Primary" },
  { to: "/political-contestation", label: "Political Compass" },
] as const;

const MOBILE_PRIMARY_NAV_ITEMS = NAV_ITEMS.slice(0, 3);
const MOBILE_OVERFLOW_NAV_ITEMS = NAV_ITEMS.slice(3);
const THEME_STORAGE_KEY = "ptr.theme.v1";

const THEME_INIT_SCRIPT = `
(() => {
  const storageKey = "${THEME_STORAGE_KEY}";
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const readMode = () => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored === "light" || stored === "dark" ? stored : "auto";
    } catch {
      return "auto";
    }
  };

  const applyTheme = (mode) => {
    const isDark = mode === "dark" || (mode === "auto" && media.matches);
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    root.dataset.themeMode = mode;
  };

  applyTheme(readMode());

  const onMediaChange = () => {
    if (readMode() === "auto") {
      applyTheme("auto");
    }
  };

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", onMediaChange);
  } else if (typeof media.addListener === "function") {
    media.addListener(onMediaChange);
  }

  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) {
      applyTheme(readMode());
    }
  });
})();
`;

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
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#ffffff" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#111827" },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
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
              <div className="py-2 md:flex md:h-11 md:items-stretch md:py-0">

                <div className="flex items-center justify-between gap-3 md:shrink-0 md:pr-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <img src={logoUrl} alt="PR:R Tools" className="h-6 w-6 rounded-sm" />
                    <span className="truncate text-sm font-semibold tracking-tight text-foreground">PR:R Tools</span>
                  </div>
                  <div className="min-w-[160px] max-w-[220px] flex-1 md:hidden">
                    <NationPicker />
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1 md:hidden">
                  <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
                    {MOBILE_PRIMARY_NAV_ITEMS.map(({ to, label, exact }) => (
                      <MobileNavLink key={to} to={to} label={label} exact={exact} />
                    ))}
                  </div>
                  {MOBILE_OVERFLOW_NAV_ITEMS.length > 0 && <MobileToolsMenu />}
                </div>

                <div className="mt-2 md:hidden">
                  <SignInBadge />
                </div>

                <div className="hidden md:flex md:min-w-0 md:flex-1 md:items-stretch">
                  <div className="flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-1 md:overflow-visible">
                    {NAV_ITEMS.map(({ to, label, exact }) => (
                      <Link
                        key={to}
                        to={to}
                        activeOptions={exact ? { exact: true } : undefined}
                        activeProps={{ className: "text-foreground border-foreground" }}
                        inactiveProps={{ className: "text-muted-foreground border-transparent hover:text-foreground" }}
                        className="mb-[-1px] flex shrink-0 items-center border-b-2 px-2.5 text-xs font-medium transition-colors"
                      >
                        {label}
                      </Link>
                    ))}
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <div className="w-[175px]">
                      <NationPicker />
                    </div>
                    <SignInBadge />
                  </div>
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

function MobileNavLink({
  to,
  label,
  exact,
}: {
  to: (typeof NAV_ITEMS)[number]["to"];
  label: (typeof NAV_ITEMS)[number]["label"];
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={exact ? { exact: true } : undefined}
      activeProps={{ className: "border-foreground bg-accent text-foreground" }}
      inactiveProps={{ className: "border-input text-muted-foreground hover:text-foreground" }}
      className="inline-flex h-8 min-w-0 items-center justify-center rounded-md border px-2 text-center text-[11px] font-medium leading-tight transition-colors"
    >
      <span className="truncate">{label}</span>
    </Link>
  );
}

function MobileToolsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2"
          aria-label="More tools"
        >
          <MoreHorizontal className="size-4" />
          More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {MOBILE_OVERFLOW_NAV_ITEMS.map(({ to, label, exact }) => (
          <DropdownMenuItem key={to} asChild>
            <Link
              to={to}
              activeOptions={exact ? { exact: true } : undefined}
              className="w-full"
            >
              {label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

