export const privacyLevels = ["public", "handshake", "owner_only"] as const;
export type PrivacyLevel = (typeof privacyLevels)[number];

export const routeIds = [
  "landing",
  "onboarding",
  "matching",
  "dialogue",
  "referral",
] as const;
export type RouteId = (typeof routeIds)[number];

export interface FlowRoute {
  id: RouteId;
  step: string;
  title: string;
  summary: string;
  href: string;
}

export interface UserProfile {
  id: string;
  name: string;
  school: string;
  major: string;
  year: string;
  goal: string;
  tagline: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  summary: string;
  privacyLevel: PrivacyLevel;
  source: string;
}

export interface AgentProfile {
  id: string;
  ownerId: string;
  displayName: string;
  voice: string;
  privacyLevel: PrivacyLevel;
  knowledgeCount: number;
}

export interface MatchReason {
  title: string;
  detail: string;
  evidence: string[];
}

export interface MatchCandidate {
  id: string;
  displayName: string;
  headline: string;
  score: number;
  privacyLevel: PrivacyLevel;
  reasons: MatchReason[];
}

export type Speaker = "junior_agent" | "senior_agent" | "system";

export interface A2ATurn {
  id: string;
  speaker: Speaker;
  content: string;
  privacyLevel: PrivacyLevel;
  cite?: string;
}

export interface A2ASession {
  id: string;
  juniorAgentId: string;
  seniorAgentId: string;
  privacyLevel: PrivacyLevel;
  turns: A2ATurn[];
  summary: string;
}

export type ReferralState = "pending" | "approved" | "rejected";

export interface ReferralDecision {
  id: string;
  status: ReferralState;
  summary: string;
  handoffRequirement: string;
  updatedAt: string;
}

export const demoFlowRoutes: FlowRoute[] = [
  {
    id: "landing",
    step: "P0",
    title: "Identity landing",
    summary: "Choose a role and enter the flow.",
    href: "/",
  },
  {
    id: "onboarding",
    step: "P1",
    title: "Persona construction",
    summary: "Upload context, tag privacy, and shape the agent.",
    href: "/onboarding",
  },
  {
    id: "matching",
    step: "P2",
    title: "Path matching",
    summary: "Compare trajectories and surface explainable candidates.",
    href: "/matching",
  },
  {
    id: "dialogue",
    step: "P3",
    title: "A2A dialogue",
    summary: "Run a protocol-like conversation with trace and citations.",
    href: "/dialogue",
  },
  {
    id: "referral",
    step: "P4",
    title: "Human referral",
    summary: "Stop at the human decision boundary.",
    href: "/referral",
  },
];

export const demoUserProfile: UserProfile = {
  id: "student-fdu-001",
  name: "FDU Junior",
  school: "Fudan University",
  major: "Computer Science",
  year: "Junior",
  goal: "Summer internship",
  tagline: "I want the agent to ask the right questions first.",
};

export const demoKnowledgeItems: KnowledgeItem[] = [
  {
    id: "kb-01",
    title: "Resume snapshot",
    summary: "Research projects, internship, and relevant coursework.",
    privacyLevel: "public",
    source: "Upload",
  },
  {
    id: "kb-02",
    title: "Interview notes",
    summary: "Round-by-round questions and recruiter feedback.",
    privacyLevel: "handshake",
    source: "Personal notes",
  },
  {
    id: "kb-03",
    title: "Internal reflection",
    summary: "What I would say only after trust is established.",
    privacyLevel: "owner_only",
    source: "Private journal",
  },
];

export const demoMatchCandidates: MatchCandidate[] = [
  {
    id: "mentor-01",
    displayName: "23届量化学长",
    headline: "Same school, adjacent path, similar internship timing.",
    score: 0.92,
    privacyLevel: "handshake",
    reasons: [
      {
        title: "Path overlap",
        detail: "Both moved from school research into the same target track.",
        evidence: ["same school", "similar internship cycle"],
      },
      {
        title: "Goal proximity",
        detail: "Their recent experience answers the user's current goal.",
        evidence: ["summer internship", "targeted mentor"],
      },
    ],
  },
  {
    id: "mentor-02",
    displayName: "研究院学姐",
    headline: "One step ahead on the same path, with explainable evidence.",
    score: 0.87,
    privacyLevel: "public",
    reasons: [
      {
        title: "Evidence-rich profile",
        detail: "The agent can justify this recommendation with concrete notes.",
        evidence: ["resume snippet", "public project writeup"],
      },
    ],
  },
  {
    id: "mentor-03",
    displayName: "跨专业前辈",
    headline: "Good fit when the user wants a different but adjacent path.",
    score: 0.81,
    privacyLevel: "owner_only",
    reasons: [
      {
        title: "Adjacent trajectory",
        detail: "Useful for comparing tradeoffs and next-step decisions.",
        evidence: ["switch path", "decision reflection"],
      },
    ],
  },
];

export const demoDialogueSession: A2ASession = {
  id: "a2a-001",
  juniorAgentId: "junior-agent",
  seniorAgentId: "senior-agent",
  privacyLevel: "handshake",
  summary: "The agent asked about GPA thresholds, interview structure, and risk points.",
  turns: [
    {
      id: "turn-1",
      speaker: "junior_agent",
      content: "Could you share the GPA threshold and the earliest preparation advice?",
      privacyLevel: "public",
    },
    {
      id: "turn-2",
      speaker: "senior_agent",
      content: "The threshold was competitive, but the stronger signal was fit and preparation consistency.",
      privacyLevel: "handshake",
      cite: "2024-interview-notes#line-23",
    },
    {
      id: "turn-3",
      speaker: "system",
      content: "Trace: kb_search(query='summer internship') returned 3 relevant snippets.",
      privacyLevel: "public",
    },
  ],
};

export const demoReferralDecision: ReferralDecision = {
  id: "referral-001",
  status: "pending",
  summary: "The agent has prepared a human-readable handoff, but the human still decides.",
  handoffRequirement: "Manual approval required before any contact details are revealed.",
  updatedAt: "2026-05-17T00:00:00Z",
};
