import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PulseBank — Real-Time Transaction Monitoring" },
      { name: "description", content: "Real-time banking transaction monitoring with admin and customer dashboards." },
      { property: "og:title", content: "PulseBank — Real-Time Transaction Monitoring" },
      { name: "twitter:title", content: "PulseBank — Real-Time Transaction Monitoring" },
      { property: "og:description", content: "Real-time banking transaction monitoring with admin and customer dashboards." },
      { name: "twitter:description", content: "Real-time banking transaction monitoring with admin and customer dashboards." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/8d49b8bc-6267-423f-989f-17fca4b0ca74/id-preview-a41eb516--29d56264-e55c-4832-baf6-95ea66f95411.lovable.app-1782760059111.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/8d49b8bc-6267-423f-989f-17fca4b0ca74/id-preview-a41eb516--29d56264-e55c-4832-baf6-95ea66f95411.lovable.app-1782760059111.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
