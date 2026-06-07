import { AppShell } from "../../components/AppShell";
import {
  demoDialogueSession,
  type PrivacyLevel,
  type Speaker,
} from "@re-fudan/contracts";

const speakerCopy: Record<
  Speaker,
  {
    label: string;
    role: string;
    tone: string;
  }
> = {
  junior_agent: {
    label: "Junior agent",
    role: "Question shaping",
    tone: "Turns vague intent into inspectable asks.",
  },
  senior_agent: {
    label: "Senior agent",
    role: "Experience relay",
    tone: "Answers with bounded memory and explicit confidence.",
  },
  system: {
    label: "System trace",
    role: "Protocol logging",
    tone: "Makes retrieval, privacy, and guardrails visible.",
  },
};

const privacyCopy: Record<PrivacyLevel, string> = {
  public: "Public",
  handshake: "Handshake",
  owner_only: "Owner only",
};

const highlightedTurnId = demoDialogueSession.turns[1]?.id;
const citedTurns = demoDialogueSession.turns.filter((turn) => turn.cite);
const privacyLevelsSeen = new Set(demoDialogueSession.turns.map((turn) => turn.privacyLevel));

export default function DialoguePage() {
  return (
    <AppShell
      activeRoute="dialogue"
      eyebrow="P3 route A2A dialogue"
      title="Show the protocol, the trace, and the evidence."
      summary="The conversation stays inspectable so teammates and judges can see why each answer happened."
    >
      <div className="dialogue-stage">
        <aside className="card dialogue-rail">
          <div>
            <p className="card__step">Session rail</p>
            <h2>Turn-by-turn trace</h2>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <strong>{demoDialogueSession.turns.length}</strong>
              <span>Visible turns</span>
            </div>
            <div className="stat-card">
              <strong>{privacyLevelsSeen.size}</strong>
              <span>Privacy tiers used</span>
            </div>
          </div>

          <div className="dialogue-list">
            {demoDialogueSession.turns.map((turn, index) => {
              const meta = speakerCopy[turn.speaker];

              return (
                <article
                  key={turn.id}
                  className={turn.id === highlightedTurnId ? "dialogue-turn is-highlighted" : "dialogue-turn"}
                >
                  <div className="dialogue-turn__meta">
                    <div className="dialogue-turn__speaker">
                      <span className="speaker-dot" aria-hidden="true" />
                      <div>
                        <strong>{meta.label}</strong>
                        <p className="muted">{meta.role}</p>
                      </div>
                    </div>
                    <span className="tag">T{index + 1}</span>
                  </div>
                  <p>{turn.content}</p>
                  <p className="muted">{privacyCopy[turn.privacyLevel]} visibility</p>
                </article>
              );
            })}
          </div>
        </aside>

        <section className="card dialogue-focus">
          <div className="dialogue-focus__hero">
            <div className="session-strip">
              <span className="shell-pill">Core demo page</span>
              <span className="session-chip">{privacyCopy[demoDialogueSession.privacyLevel]} session</span>
              <span className="session-chip">Inspectability on</span>
            </div>

            <div>
              <p className="card__step">Central stage</p>
              <h2>A careful three-column story, not a raw message dump.</h2>
            </div>

            <p className="dialogue-focus__lede muted">
              The center panel frames the actual exchange, while the side columns keep protocol
              logic and supporting evidence visible enough for demo audiences to follow the
              reasoning in real time.
            </p>
          </div>

          <div className="conversation-stack">
            {demoDialogueSession.turns.map((turn) => {
              const meta = speakerCopy[turn.speaker];
              const bubbleClass =
                turn.speaker === "junior_agent"
                  ? "conversation-bubble is-junior"
                  : turn.speaker === "senior_agent"
                    ? "conversation-bubble is-senior"
                    : "conversation-bubble is-system";

              return (
                <article key={turn.id} className={bubbleClass}>
                  <span className="bubble-label">{meta.label}</span>
                  <p>{turn.content}</p>
                  <p className="muted">{meta.tone}</p>
                </article>
              );
            })}
          </div>

          <div className="nested-card">
            <p className="card__step">Session note</p>
            <h3>{demoDialogueSession.summary}</h3>
            <p>
              The main value of this page is not the answer alone. It is the way answer, trace,
              privacy, and citation stay legible in one view.
            </p>
          </div>

          <div className="protocol-flow">
            <div className="protocol-node">
              <strong>Ask</strong>
              <p>Junior intent is narrowed into a precise request before any retrieval happens.</p>
            </div>
            <div className="protocol-node">
              <strong>Ground</strong>
              <p>Senior-side memory stays bounded by explicit evidence and privacy tags.</p>
            </div>
            <div className="protocol-node">
              <strong>Reveal</strong>
              <p>System traces make the hidden mechanics visible enough for judges to trust.</p>
            </div>
          </div>
        </section>

        <aside className="dialogue-inspector">
          <section className="card">
            <p className="card__step">Evidence panel</p>
            <h2>Citations</h2>
            <ul className="evidence-list">
              {citedTurns.map((turn) => (
                <li key={turn.id}>
                  <strong>{speakerCopy[turn.speaker].label}</strong>
                  <p>{turn.content}</p>
                  <p className="muted">{turn.cite}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <p className="card__step">Protocol rules</p>
            <h2>Guardrails</h2>
            <ul className="rule-list">
              <li>
                <strong>Privacy is explicit</strong>
                <p className="muted">Every turn keeps its visibility level attached to the content.</p>
              </li>
              <li>
                <strong>Trace is first-class</strong>
                <p className="muted">Retrieval events are shown beside the dialogue instead of hidden.</p>
              </li>
              <li>
                <strong>Human boundary stays intact</strong>
                <p className="muted">This page prepares trust, but never skips the later handoff gate.</p>
              </li>
            </ul>
          </section>

          <section className="card">
            <p className="card__step">Session snapshot</p>
            <h2>Readiness</h2>
            <div className="stat-grid">
              <div className="stat-card">
                <strong>{citedTurns.length}</strong>
                <span>Cited replies</span>
              </div>
              <div className="stat-card">
                <strong>{demoDialogueSession.turns.filter((turn) => turn.speaker === "system").length}</strong>
                <span>Trace events</span>
              </div>
              <div className="stat-card">
                <strong>{speakerCopy.senior_agent.label}</strong>
                <span>Answer source</span>
              </div>
              <div className="stat-card">
                <strong>Ready</strong>
                <span>For P4 handoff</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
