// app/api/local-env/execute/route.ts
// Stub execute route - minimal implementation to verify routing works

import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  console.log("[local-env/execute] body:", body);

  return new Response(
    JSON.stringify({ ok: true, message: "Stub execute route reached." }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

