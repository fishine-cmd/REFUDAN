import { describe, expect, it } from "bun:test";
import type { A2ATurn } from "@re-fudan/contracts";
import {
  buildAssessmentFromTurns,
  buildA2AIntentHash,
  buildAutoplayQuestion,
  mergeBaseScoreWithAssessment,
  planNextAutoplaySlot,
  shouldStopAutoplay,
} from "../a2a-orchestrator";

describe("a2a orchestrator", () => {
  it("plans the next uncovered slot based on intent", () => {
    const slot = planNextAutoplaySlot({
      intent: {
        direction: "保研 / 夏令营策略",
        question: "我想知道 GPA 门槛和夏令营难度",
      },
      coveredSlots: ["camp_difficulty"],
    });

    expect(slot).toBe("gpa_threshold");
  });

  it("builds an assessment and can stop when enough evidence is covered", () => {
    const turns: A2ATurn[] = [
      {
        id: "1",
        speaker: "junior_agent",
        kind: "question",
        content: buildAutoplayQuestion({
          intent: { question: "想判断这条路径值不值得冲" },
          nextSlot: "camp_difficulty",
        }),
        privacyLevel: "handshake",
        source: "manual",
        slot: "camp_difficulty",
      },
      {
        id: "2",
        speaker: "senior_agent",
        kind: "response",
        content: "整体难度不低，但如果你 GPA 和经历都在线，还是值得继续争取。",
        privacyLevel: "handshake",
        source: "manual",
        slot: "camp_difficulty",
      },
      {
        id: "3",
        speaker: "junior_agent",
        kind: "question",
        content: "GPA 和硬门槛大概在哪个区间？",
        privacyLevel: "handshake",
        source: "autoplay",
        slot: "gpa_threshold",
      },
      {
        id: "4",
        speaker: "senior_agent",
        kind: "response",
        content: "GPA 通常是硬门槛之一，达到上游区间会更有机会，我会建议继续准备。",
        privacyLevel: "handshake",
        source: "autoplay",
        slot: "gpa_threshold",
      },
      {
        id: "5",
        speaker: "junior_agent",
        kind: "question",
        content: "导师或组里的沟通风格通常是什么样？",
        privacyLevel: "handshake",
        source: "autoplay",
        slot: "mentor_style",
      },
      {
        id: "6",
        speaker: "senior_agent",
        kind: "response",
        content: "导师风格比较直接，适合愿意主动沟通的人，整体上我觉得这条路径和你的目标较匹配。",
        privacyLevel: "handshake",
        source: "autoplay",
        slot: "mentor_style",
      },
    ];

    const assessment = buildAssessmentFromTurns({
      sessionId: "session-1",
      intentHash: buildA2AIntentHash({ question: "想判断这条路径值不值得冲" }),
      turns,
      coveredSlots: ["camp_difficulty", "gpa_threshold", "mentor_style"],
      round: 3,
      status: "running",
    });

    expect(assessment.verdict).toBe("strong_match");
    expect(
      shouldStopAutoplay({
        round: 3,
        maxRounds: 7,
        coveredSlots: assessment.coveredSlots,
        assessment,
      }),
    ).toBe(true);
  });

  it("merges base score with completed assessment only", () => {
    const merged = mergeBaseScoreWithAssessment(70, {
      sessionId: "s1",
      status: "completed",
      verdict: "strong_match",
      adjustedScore: 90,
      summary: "done",
      insights: [],
      coveredSlots: ["camp_difficulty"],
      round: 4,
      intentHash: "i1",
      updatedAt: Date.now(),
    });

    const untouched = mergeBaseScoreWithAssessment(70, {
      sessionId: "s2",
      status: "running",
      verdict: "promising",
      adjustedScore: 90,
      summary: "running",
      insights: [],
      coveredSlots: ["camp_difficulty"],
      round: 2,
      intentHash: "i1",
      updatedAt: Date.now(),
    });

    expect(merged).toBeGreaterThan(70);
    expect(untouched).toBe(70);
  });
});
