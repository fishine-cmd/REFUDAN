import { AppShell } from "../../components/AppShell";
import { demoReferralDecision } from "@re-fudan/contracts";

export default function ReferralPage() {
  return (
    <AppShell
      activeRoute="referral"
      eyebrow="P4 · Human referral"
      title="Stop at the human boundary."
      summary="The agent prepares the handoff, but the human still approves or rejects."
    >
      <div className="two-column">
        <section className="card">
          <p className="card__step">Referral packet</p>
          <h2>{demoReferralDecision.status}</h2>
          <p>{demoReferralDecision.summary}</p>
          <p className="muted">{demoReferralDecision.handoffRequirement}</p>
        </section>

        <section className="card">
          <p className="card__step">Decision surface</p>
          <div className="button-row">
            <button className="button button--primary" type="button">
              Approve intro
            </button>
            <button className="button button--ghost" type="button">
              Reject intro
            </button>
          </div>
          <p className="muted">This surface is intentionally human-controlled.</p>
        </section>
      </div>
    </AppShell>
  );
}
