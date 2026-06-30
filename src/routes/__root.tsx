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
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PtrAuthProvider } from "../lib/ptr-auth";
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
  console.error(error);
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

  return (
    <QueryClientProvider client={queryClient}>
      <PtrAuthProvider>
        <nav className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center gap-1 h-12">
            <span className="text-sm font-semibold tracking-tight text-foreground mr-4">PR:R Tools</span>
            <Link
              to="/"
              activeOptions={{ exact: true }}
              activeProps={{ className: "text-foreground border-foreground" }}
              inactiveProps={{ className: "text-muted-foreground border-transparent hover:text-foreground" }}
              className="text-xs font-medium px-3 h-12 inline-flex items-center border-b-2 transition-colors"
            >
              Polling
            </Link>
            <Link
              to="/majority"
              activeProps={{ className: "text-foreground border-foreground" }}
              inactiveProps={{ className: "text-muted-foreground border-transparent hover:text-foreground" }}
              className="text-xs font-medium px-3 h-12 inline-flex items-center border-b-2 transition-colors"
            >
              Majority calculator
            </Link>
            <Link
              to="/members"
              activeProps={{ className: "text-foreground border-foreground" }}
              inactiveProps={{ className: "text-muted-foreground border-transparent hover:text-foreground" }}
              className="text-xs font-medium px-3 h-12 inline-flex items-center border-b-2 transition-colors"
            >
              Members
            </Link>
            <SignInBadge />
          </div>
        </nav>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </PtrAuthProvider>
    </QueryClientProvider>
  );
}

