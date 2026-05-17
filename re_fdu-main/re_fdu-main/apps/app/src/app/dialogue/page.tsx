import { AppShell } from "../../components/AppShell";
import { demoDialogueSession } from "@re-fudan/contracts";

export default function DialoguePage() {
  return (
    <AppShell
      activeRoute="dialogue"
      eyebrow="P3 · A2A dialogue"
      title="Show the protocol, the trace, and the evidence."
      summary="The conversation stays inspectable so teammates and judges can see why each answer happened."
    >
      <div className="two-column">
        <section className="card">
          <p className="card__step">Turn trace</p>
          <div className="stack">
            {demoDialogueSession.turns.map((turn) => (
              <article key={turn.id} className="nested-card">
                <div className="row">
                  <strong>{turn.speaker}</strong>
                  <span className="tag">{turn.privacyLevel}</span>
                </div>
                <p>{turn.content}</p>
                {turn.cite ? <p className="muted">{turn.cite}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <p className="card__step">Summary</p>
          <h2>Session note</h2>
          <p>{demoDialogueSession.summary}</p>
          <div className="nested-card">
            <strong>Protocol rule</strong>
            <p>Privacy stays visible and the human handoff boundary remains explicit.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
