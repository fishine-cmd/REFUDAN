import { AppShell } from "../../components/AppShell";
import { demoKnowledgeItems, demoUserProfile } from "@re-fudan/contracts";

export default function OnboardingPage() {
  return (
    <AppShell
      activeRoute="onboarding"
      eyebrow="P1 · Persona construction"
      title="Build a visible, privacy-aware agent profile."
      summary="Uploads, notes, and self-description become a filtered profile the agent can use."
    >
      <div className="two-column">
        <section className="card">
          <p className="card__step">Profile snapshot</p>
          <h2>{demoUserProfile.name}</h2>
          <p>{demoUserProfile.school} · {demoUserProfile.major}</p>
          <p>{demoUserProfile.goal}</p>
          <p className="muted">{demoUserProfile.tagline}</p>
        </section>

        <section className="card">
          <p className="card__step">Knowledge items</p>
          <div className="stack">
            {demoKnowledgeItems.map((item) => (
              <article key={item.id} className="nested-card">
                <div className="row">
                  <strong>{item.title}</strong>
                  <span className="tag">{item.privacyLevel}</span>
                </div>
                <p>{item.summary}</p>
                <p className="muted">{item.source}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
