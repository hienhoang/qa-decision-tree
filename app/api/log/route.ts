import { NextRequest, NextResponse } from "next/server";

function getSheetsUrl() {
  const url = process.env.SHEETS_URL;
  if (!url) throw new Error("SHEETS_URL not configured");
  return url;
}

async function fetchFollowingRedirects(url: string, options: RequestInit = {}): Promise<string> {
  let currentUrl = url;
  let res = await fetch(currentUrl, { ...options, redirect: "manual" });

  let hops = 0;
  while (res.status >= 300 && res.status < 400 && hops < 5) {
    const redirectUrl = res.headers.get("location");
    if (!redirectUrl) break;
    currentUrl = redirectUrl;
    res = await fetch(currentUrl, { redirect: "manual" });
    hops++;
  }

  return res.text();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = await fetchFollowingRedirects(getSheetsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...body }),
    });
    return NextResponse.json({ success: true, response: text });
  } catch (err) {
    console.error("Sheets proxy error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = getSheetsUrl();
    const text = await fetchFollowingRedirects(url);
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ error: "Invalid response from Sheets", raw: text.slice(0, 200) }, { status: 502 });
    }
  } catch (err) {
    console.error("Sheets fetch error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const text = await fetchFollowingRedirects(getSheetsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", ...body }),
    });
    return NextResponse.json({ success: true, response: text });
  } catch (err) {
    console.error("Sheets update error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const text = await fetchFollowingRedirects(getSheetsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: body.id }),
    });
    return NextResponse.json({ success: true, response: text });
  } catch (err) {
    console.error("Sheets delete error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
