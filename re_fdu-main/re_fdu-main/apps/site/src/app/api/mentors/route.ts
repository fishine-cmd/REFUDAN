// Deprecated:5.2-5.3 期间的薄 alias,内部转发 /api/seniors。
// 5.4 删除前端 /mentors 页面同时删除本路由。
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL("/api/seniors", req.url);
  const r = await fetch(url, {
    headers: req.headers,
    cache: "no-store",
  });
  return new NextResponse(r.body, {
    status: r.status,
    headers: r.headers,
  });
}
