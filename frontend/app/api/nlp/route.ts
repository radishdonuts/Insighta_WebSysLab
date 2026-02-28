import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { prompt } = (await request.json()) as { prompt?: string };

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const fastApiBase = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";
  const endpoint = `${fastApiBase.replace(/\/$/, "")}/nlp/generate`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "FastAPI NLP endpoint unavailable.", endpoint },
      { status: 502 }
    );
  }

  const data = (await res.json()) as { output?: string; response?: string };
  return NextResponse.json({ output: data.output ?? data.response ?? "" });
}
