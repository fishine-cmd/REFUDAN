import fs from "fs";
import path from "path";

export type ConsentStatus = "granted" | "pending" | "revoked";

export interface MentorProfile {
  id: string;
  name: string;
  title: string;
  avatar: string | null;
  consent_status: ConsentStatus;
  consent_granted_at: string | null;
  data_source: "authorized_self_report" | "demo_mock";
  secondme_user_id: string | null;
  scores: [number, number, number, number];
  tags: string[];
  badges: string[];
  highlight: string;
  persona: {
    name: string;
    background: string;
    expertise: string;
  };
  detailed_profile?: Record<string, unknown>;
}

export interface MentorSummary {
  id: string;
  name: string;
  title: string;
  avatar: string | null;
  consent_status: ConsentStatus;
  secondme_linked: boolean;
  scores: [number, number, number, number];
  tags: string[];
  badges: string[];
  highlight: string;
  meta: string;
}

const mentorsDir = path.join(process.cwd(), "src/data/mentors");

export function loadMentor(id: string): MentorProfile | null {
  try {
    const filePath = path.join(mentorsDir, `${id}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as MentorProfile;
  } catch {
    return null;
  }
}

export function getAllMentors(): MentorSummary[] {
  try {
    const files = fs.readdirSync(mentorsDir).filter((f) => f.endsWith(".json"));
    return files.map((file) => {
      const raw = fs.readFileSync(path.join(mentorsDir, file), "utf-8");
      const profile = JSON.parse(raw) as MentorProfile;
      return {
        id: profile.id,
        name: profile.name,
        title: profile.title,
        avatar: profile.avatar,
        consent_status: profile.consent_status,
        secondme_linked: profile.secondme_user_id !== null,
        scores: profile.scores,
        tags: profile.tags,
        badges: profile.badges,
        highlight: profile.highlight,
        meta: profile.title,
      };
    });
  } catch {
    return [];
  }
}
