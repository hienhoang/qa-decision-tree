import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";

const CACHE_TAG = "ticket-log";
const CACHE_REVALIDATE = 60; // seconds

function getSheetsUrl() {
  const url = process.env.SHEETS_URL;
  if (!url) throw new Error("SHEETS_URL not configured");
  return url;
}

async function fetchSheets(url: string, options: RequestInit = {}): Promise<string> {
  if (options.method === "POST") {
    const res = await fetch(url, { ...options, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const r2 = await fetch(loc, { redirect: "follow" });
        return r2.text();
      }
    }
    return res.text();
  }
  const res = await fetch(url, { ...options, redirect: "follow" });
  return res.text();
}

function isHtmlResponse(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<?xml");
}

async function fetchLogFromSheets() {
  const url = getSheetsUrl();
  const text = await fetchSheets(url);
  if (isHtmlResponse(text)) {
    throw new Error(
      "Google Apps Script returned an error page instead of JSON. Check: (1) Open the Apps Script editor and run the script — fix any errors. (2) Deployment → Manage deployments → redeploy; if prompted, re-authorize. (3) Deployment settings → ensure 'Execute as: Me' (not 'User accessing'). (4) Wait a few minutes if you hit quota limits."
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid response from Sheets — ${text.slice(0, 200)}`);
  }
}

const getCachedLog = unstable_cache(fetchLogFromSheets, [CACHE_TAG], { revalidate: CACHE_REVALIDATE, tags: [CACHE_TAG] });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = await fetchSheets(getSheetsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...body }),
    });
    revalidateTag(CACHE_TAG);
    return NextResponse.json({ success: true, response: text });
  } catch (err) {
    console.error("Sheets proxy error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCachedLog();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Sheets fetch error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const text = await fetchSheets(getSheetsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", ...body }),
    });
    revalidateTag(CACHE_TAG);
    return NextResponse.json({ success: true, response: text });
  } catch (err) {
    console.error("Sheets update error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const text = await fetchSheets(getSheetsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: body.id }),
    });
    revalidateTag(CACHE_TAG);
    return NextResponse.json({ success: true, response: text });
  } catch (err) {
    console.error("Sheets delete error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
