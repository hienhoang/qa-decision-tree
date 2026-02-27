import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const sheetsUrl = process.env.SHEETS_URL;
  if (!sheetsUrl) {
    return NextResponse.json({ error: "SHEETS_URL not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();

    const res = await fetch(sheetsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow",
    });

    const text = await res.text();
    return NextResponse.json({ success: true, response: text });
  } catch (err) {
    console.error("Sheets proxy error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
