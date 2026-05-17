import { NextResponse } from "next/server";
import { getAllMentors } from "@/data/mentors";

export async function GET() {
  const mentors = getAllMentors();
  return NextResponse.json({ mentors });
}
