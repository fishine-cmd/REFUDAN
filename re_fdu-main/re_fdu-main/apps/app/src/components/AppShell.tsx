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
      <div className="app-shell__ambient" aria-hidden="true" />
      <header className="app-shell__header">
        <div className="app-shell__header-copy">
          <div className="app-shell__eyebrow-row">
            <p className="app-shell__eyebrow">{eyebrow}</p>
            <span className="shell-pill">Walkthrough demo</span>
          </div>
          <h1>{title}</h1>
          <p className="app-shell__summary">{summary}</p>
        </div>
        <div className="app-shell__header-side">
          <p className="app-shell__header-label">Narrative frame</p>
          <p className="app-shell__header-note">
            A structured prototype for showing privacy, protocol, and human handoff in one
            coherent product surface.
          </p>
          <a className="back-link" href={siteUrl}>
            Back to landing
          </a>
        </div>
      </header>

      <nav className="route-nav" aria-label="Flow routes">
        {demoFlowRoutes.map((route) => (
          <Link
            key={route.id}
            href={route.href}
            className={route.id === activeRoute ? "route-nav__item is-active" : "route-nav__item"}
          >
            <span className="route-nav__step">{route.step}</span>
            <strong>{route.title}</strong>
            <span className="route-nav__summary">{route.summary}</span>
          </Link>
        ))}
      </nav>

      <section className="app-shell__content">{children}</section>
    </main>
  );
}
