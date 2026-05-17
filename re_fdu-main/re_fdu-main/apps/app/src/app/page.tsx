import Link from "next/link";
import { demoFlowRoutes } from "@re-fudan/contracts";
import { AppShell } from "../components/AppShell";

export default function ProductHomePage() {
  return (
    <AppShell
      activeRoute="landing"
      eyebrow="Product shell"
      title="Route scaffolds for the full P0 → P4 demo."
      summary="This app keeps the product walkthrough modular so each step can evolve without breaking the shared contract layer."
    >
      <div className="card-grid">
        {demoFlowRoutes.slice(1).map((route) => (
          <Link key={route.id} href={route.href} className="card">
            <p className="card__step">{route.step}</p>
            <h2>{route.title}</h2>
            <p>{route.summary}</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
