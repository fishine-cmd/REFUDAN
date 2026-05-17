import { AppShell } from "../../components/AppShell";
import { demoMatchCandidates } from "@re-fudan/contracts";

export default function MatchingPage() {
  return (
    <AppShell
      activeRoute="matching"
      eyebrow="P2 · Path matching"
      title="Recommend mentors with explainable reasons."
      summary="Candidates are surfaced by trajectory fit, not random browsing."
    >
      <div className="stack">
        {demoMatchCandidates.map((candidate) => (
          <article key={candidate.id} className="card">
            <div className="row">
              <div>
                <p className="card__step">score {Math.round(candidate.score * 100)}%</p>
                <h2>{candidate.displayName}</h2>
              </div>
              <span className="tag">{candidate.privacyLevel}</span>
            </div>
            <p>{candidate.headline}</p>
            <div className="stack">
              {candidate.reasons.map((reason) => (
                <div key={reason.title} className="nested-card">
                  <strong>{reason.title}</strong>
                  <p>{reason.detail}</p>
                  <p className="muted">{reason.evidence.join(" · ")}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
