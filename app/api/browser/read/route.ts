import { NextRequest, NextResponse } from 'next/server';

const BROWSER_SERVICE_URL = process.env.BROWSER_SERVICE_URL || 'http://localhost:7071';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sid = searchParams.get('sid');
    const mode = searchParams.get('mode');
    const maxChars = searchParams.get('maxChars');

    if (!sid) {
      return NextResponse.json({ error: 'sid is required' }, { status: 400 });
    }

    const params = new URLSearchParams({ sid });
    if (mode) params.append('mode', mode);
    if (maxChars) params.append('maxChars', maxChars);

    const response = await fetch(`${BROWSER_SERVICE_URL}/read?${params}`);

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



