/**
 * GET /api/profile/search?q=...&industry=...&skill=...&skill=...&grade=...
 *
 * Search stored profiles by full-text query and/or structured criteria.
 */

import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/python-bridge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const industry = searchParams.get("industry");
  const skills = searchParams.getAll("skill");
  const grade = searchParams.get("grade");

  const args: string[] = [];

  if (q) {
    args.push("--search", q);
  }
  if (industry) {
    args.push("--search-industry", industry);
  }
  for (const sk of skills) {
    args.push("--search-skills", sk);
  }
  if (grade) {
    args.push("--search-grade", grade);
  }
  args.push("--top-k", "10");

  if (args.length === 2) {
    // Only --top-k was set
    return NextResponse.json(
      { error: "At least one search parameter is required (q, industry, skill, grade)" },
      { status: 400 },
    );
  }

  const result = await runPipeline(args, 30_000);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Search failed" },
      { status: 500 },
    );
  }
  return NextResponse.json(result.data);
}
