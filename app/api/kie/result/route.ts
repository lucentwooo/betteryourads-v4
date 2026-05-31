import { NextRequest, NextResponse } from "next/server";
import { getApprovedUser } from "@/lib/auth-guard";
import { KIE_API_KEY } from "@/lib/env";

// ── KIE Stage 3 polling. ── Mirrors server.js GET /kie/result.
export async function GET(req: NextRequest) {
  const auth = await getApprovedUser(req);
  if (auth instanceof NextResponse) return auth;

  const apiKey = KIE_API_KEY();
  if (!apiKey) return NextResponse.json({ error: "KIE_API_KEY is not set in .env" }, { status: 500 });

  const taskId = String(req.nextUrl.searchParams.get("taskId") || "");
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  try {
    const r = await fetch("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(taskId), {
      headers: { Authorization: "Bearer " + apiKey },
    });
    let data: {
      data?: {
        resultJson?: string;
        state?: string;
        progress?: unknown;
        failMsg?: string;
        failCode?: string;
      };
      code?: number;
      msg?: string;
      message?: string;
    } | null;
    try {
      data = await r.json();
    } catch {
      data = null;
    }
    if (!r.ok || (data && data.code !== 200)) {
      return NextResponse.json(
        { error: (data && (data.msg || data.message)) || "KIE recordInfo HTTP " + r.status },
        { status: 502 }
      );
    }
    const d = (data && data.data) || {};
    let urls: unknown = [];
    if (d.resultJson) {
      try {
        const p = JSON.parse(d.resultJson);
        urls = p.resultUrls || p.result_urls || [];
      } catch {}
    }
    return NextResponse.json({ state: d.state || "", progress: d.progress, urls, failMsg: d.failMsg || d.failCode || "" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
