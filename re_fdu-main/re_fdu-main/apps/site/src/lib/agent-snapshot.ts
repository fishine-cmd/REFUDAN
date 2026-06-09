export interface AgentKnowledgeItem {
  id: string;
  title: string;
  source: string;
  privacy: string;
}

export interface StoredAgentProfile {
  resumeFileName?: string | null;
  resumeText?: string;
  school?: string;
  major?: string;
  gpa?: string;
  goal?: string;
  promptText?: string;
  knowledgeItems?: AgentKnowledgeItem[];
}

export interface AgentSnapshotSource {
  displayName?: string | null;
  bio?: string | null;
  title?: string | null;
  highlight?: string | null;
  avatar?: string | null;
  tagsJson?: string | unknown | null;
  personaJson?: string | unknown | null;
  detailedProfileJson?: string | unknown | null;
  builtProfileJson?: string | unknown | null;
  agentProfileJson?: string | unknown | null;
}

export interface AgentSnapshot {
  displayName: string;
  bio: string;
  title: string;
  highlight: string;
  avatarUrl: string | null;
  school: string;
  major: string;
  gpa: string;
  goal: string;
  promptText: string;
  skills: string[];
  interests: string[];
  topics: string[];
  tags: string[];
  styleCues: string[];
  knowledgeTitles: string[];
  personaBackground: string;
  personaExpertise: string;
}

type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function parseJsonRecord(value: unknown): JsonRecord {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item == null) return "";
      return String(item).trim();
    })
    .filter(Boolean);
  return unique(cleaned).slice(0, limit);
}

function parseTagsJson(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return parseStringArray(value, 8);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return parseStringArray(parsed, 8);
  } catch {
    return [];
  }
}

function firstText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return "";
}

function clip(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function joinSummary(parts: Array<string | null | undefined>, fallback = ""): string {
  const cleaned = parts.map((part) => (part ?? "").trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" / ") : fallback;
}

function isReadableName(value: string): boolean {
  return /[\p{L}\p{N}\u4e00-\u9fff]/u.test(value);
}

function collectBuiltTopics(built: JsonRecord): string[] {
  const topics = built.content_topics;
  if (!Array.isArray(topics)) return [];
  const out: string[] = [];
  for (const item of topics) {
    if (item && typeof item === "object") {
      const topic = firstText((item as JsonRecord).topic);
      if (topic) out.push(topic);
    }
  }
  return unique(out).slice(0, 8);
}

function collectBuiltStyleCues(built: JsonRecord): string[] {
  const style = (built.style_profile ?? {}) as JsonRecord;
  return unique([
    ...parseStringArray(style.writing_style, 4),
    ...parseStringArray(style.tone, 4),
    ...parseStringArray(style.visual_style, 3),
  ]).slice(0, 8);
}

function pickAvatar(
  built: JsonRecord,
  agentAvatar: string | null | undefined,
): string | null {
  if (agentAvatar) return agentAvatar;
  const builtPlatformProfiles = asJsonRecord(built.platform_profiles);
  const builtBasic = asJsonRecord(built.basic_info);
  const basicPlatformProfiles = asJsonRecord(builtBasic.platform_profiles);
  const platformProfiles =
    Object.keys(basicPlatformProfiles).length > 0
      ? basicPlatformProfiles
      : builtPlatformProfiles;
  for (const profile of Object.values(platformProfiles)) {
    if (profile && typeof profile === "object") {
      const avatar = firstText((profile as JsonRecord).avatar_url);
      if (avatar) return avatar;
    }
  }
  return null;
}

export function parseStoredAgentProfile(value: unknown): StoredAgentProfile | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as StoredAgentProfile;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as StoredAgentProfile;
  } catch {
    return null;
  }
}

export function buildAgentSnapshot(source: AgentSnapshotSource): AgentSnapshot {
  const built = parseJsonRecord(source.builtProfileJson);
  const agent = parseStoredAgentProfile(source.agentProfileJson) ?? {};
  const persona = parseJsonRecord(source.personaJson);
  const detailed = parseJsonRecord(source.detailedProfileJson);

  const builtBasic = asJsonRecord(built.basic_info);
  const builtDeclared = asJsonRecord(built.declared_profile);
  const builtInferred = asJsonRecord(built.inferred_signals);
  const builtEducation = asJsonRecord(builtInferred.education);
  const detailedEducation = asJsonRecord(detailed.education);

  const readableBuiltName = firstText(builtBasic.display_name);
  const school =
    agent.school?.trim() ||
    firstText(builtDeclared.school) ||
    firstText(builtEducation.school) ||
    firstText(detailedEducation.school) ||
    firstText(detailed.school);
  const major =
    agent.major?.trim() ||
    firstText(builtDeclared.major) ||
    firstText(builtEducation.major) ||
    firstText(detailedEducation.major) ||
    firstText(detailed.major);
  const gpa =
    agent.gpa?.trim() ||
    firstText(builtDeclared.gpa) ||
    firstText(builtEducation.gpa) ||
    firstText(detailed.gpa);
  const goal =
    agent.goal?.trim() ||
    firstText(builtDeclared.goal) ||
    firstText(builtInferred.stated_goal) ||
    firstText(builtEducation.goal) ||
    firstText(detailed.goals) ||
    firstText(detailed.target);

  const skills = unique([
    ...parseStringArray(builtInferred.skills_inferred, 8),
    ...parseStringArray((persona.expertise ? String(persona.expertise).split(/[、,，/]/) : []), 6),
  ]).slice(0, 8);
  const interests = unique([
    ...parseStringArray(builtInferred.interests, 8),
    ...parseStringArray(builtInferred.industry_signals, 6),
  ]).slice(0, 8);
  const topics = collectBuiltTopics(built);
  const styleCues = collectBuiltStyleCues(built);
  const legacyTags = parseTagsJson(source.tagsJson);
  const knowledgeTitles = unique(
    Array.isArray(agent.knowledgeItems)
      ? agent.knowledgeItems.map((item) => item?.title?.trim() ?? "").filter(Boolean)
      : [],
  ).slice(0, 6);

  const compositeName = [school, major, goal].filter(Boolean).join(" ").trim();
  const displayName =
    (readableBuiltName && isReadableName(readableBuiltName) && readableBuiltName) ||
    (compositeName && isReadableName(compositeName) && compositeName) ||
    source.displayName?.trim() ||
    "Agent";

  const bio = firstText(builtBasic.bio) || source.bio?.trim() || "";
  const title =
    joinSummary([school, major], "") ||
    source.title?.trim() ||
    firstText((persona.background as string | undefined) ?? "") ||
    (skills.length > 0 ? skills.slice(0, 2).join(" / ") : "");
  const highlight =
    clip(
      source.highlight?.trim() ||
        agent.promptText?.trim() ||
        joinSummary(
          [
            skills.length > 0 ? `擅长 ${skills.slice(0, 3).join(" / ")}` : "",
            topics.length > 0 ? `关注 ${topics.slice(0, 3).join(" / ")}` : "",
            goal ? `当前目标 ${goal}` : "",
          ],
          bio,
        ),
      140,
    ) || bio;
  const personaBackground =
    firstText(persona.background) ||
    joinSummary([school, major, goal], bio || "在校经历待补充");
  const personaExpertise =
    firstText(persona.expertise) ||
    joinSummary(
      [
        skills.slice(0, 3).join(" / "),
        interests.slice(0, 2).join(" / "),
        topics.slice(0, 2).join(" / "),
      ],
      source.title?.trim() || "经验待补充",
    );

  return {
    displayName,
    bio,
    title,
    highlight,
    avatarUrl: pickAvatar(built, source.avatar),
    school,
    major,
    gpa,
    goal,
    promptText: agent.promptText?.trim() || "",
    skills,
    interests,
    topics,
    tags: unique([...legacyTags, ...skills, ...interests, ...topics]).slice(0, 8),
    styleCues,
    knowledgeTitles,
    personaBackground,
    personaExpertise,
  };
}

export function tokenizeProfileText(values: string[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length >= 2) out.add(normalized);
    for (const token of normalized.split(/[\s,;:!?./\\|()[\]{}"'`~@#$%^&*+=<>_-]+|[，。；：！？、（）【】《》“”‘’]/)) {
      const cleaned = token.trim();
      if (cleaned.length >= 2) out.add(cleaned);
    }
  }
  return out;
}
