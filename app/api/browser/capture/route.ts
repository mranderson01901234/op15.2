import { NextRequest, NextResponse } from 'next/server';

const BROWSER_SERVICE_URL = process.env.BROWSER_SERVICE_URL || 'http://localhost:7071';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sid = searchParams.get('sid');
    const type = searchParams.get('type');
    const fullPage = searchParams.get('fullPage');

    if (!sid || !type) {
      return NextResponse.json({ error: 'sid and type are required' }, { status: 400 });
    }

    const params = new URLSearchParams({ sid, type });
    if (fullPage) params.append('fullPage', fullPage);

    const response = await fetch(`${BROWSER_SERVICE_URL}/capture?${params}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(error, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


