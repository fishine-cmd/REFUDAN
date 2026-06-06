import { NextResponse } from "next/server";
import { getMentorToken, isConfigured } from "@/lib/secondme";
import { getAllMentors } from "@/data/mentors";

export async function GET() {
  const mentors = getAllMentors();
  const status = mentors.map((m) => {
    const tok = getMentorToken(m.id);
    return {
      mentorId: m.id,
      name: m.name,
      consent_status: m.consent_status,
      secondme_linked: tok !== null,
      secondme_user_id: tok?.secondmeUserId ?? null,
      granted_at: tok?.grantedAt ?? null,
    };
  });
  return NextResponse.json({
    secondme_configured: isConfigured(),
    mentors: status,
  });
}
