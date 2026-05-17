import Link from "next/link";
import type { ReactNode } from "react";
import { demoFlowRoutes, type RouteId } from "@re-fudan/contracts";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function AppShell({
  activeRoute,
  eyebrow,
  title,
  summary,
  children,
}: Readonly<{
  activeRoute: RouteId;
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}>) {
  return (
    <main className="app-shell">
      <header className="app-shell__header">
        <div>
          <p className="app-shell__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="app-shell__summary">{summary}</p>
        </div>
        <a className="back-link" href={siteUrl}>
          Back to landing
        </a>
      </header>

      <nav className="route-nav" aria-label="Flow routes">
        {demoFlowRoutes.map((route) => (
          <Link
            key={route.id}
            href={route.href}
            className={route.id === activeRoute ? "route-nav__item is-active" : "route-nav__item"}
          >
            <span>{route.step}</span>
            <strong>{route.title}</strong>
          </Link>
        ))}
      </nav>

      <section className="app-shell__content">{children}</section>
    </main>
  );
}
