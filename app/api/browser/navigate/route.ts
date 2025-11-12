import { NextRequest, NextResponse } from 'next/server';

const BROWSER_SERVICE_URL = process.env.BROWSER_SERVICE_URL || 'http://localhost:7071';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Normalize URL - ensure it has a protocol
    if (body.url && typeof body.url === 'string') {
      let url = body.url.trim();
      if (!url.match(/^https?:\/\//i) && !url.startsWith('about:')) {
        url = `https://${url}`;
        body.url = url;
      }
    }
    
    const response = await fetch(`${BROWSER_SERVICE_URL}/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

