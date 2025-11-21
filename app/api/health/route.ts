import { NextResponse } from 'next/server';

export const runtime = 'edge'; // Force edge runtime

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    region: process.env.CF_PAGES_URL ? 'Cloudflare' : 'Local',
  });
}
