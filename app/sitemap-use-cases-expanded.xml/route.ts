import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse('The use-cases-expanded sitemap has been retired.', {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
