import { NextRequest, NextResponse } from "next/server";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = await fetchSheets(getSheetsUrl(), {
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
    const text = await fetchSheets(url);
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
    const text = await fetchSheets(getSheetsUrl(), {
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
    const text = await fetchSheets(getSheetsUrl(), {
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
