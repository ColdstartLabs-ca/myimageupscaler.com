import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeSource = () => readFileSync(join(process.cwd(), 'app/api/upscale/route.ts'), 'utf8');

describe('POST /api/upscale success payload security', () => {
  it('does not expose raw provider imageUrl or imageData in successful JSON', () => {
    const source = routeSource();
    const responseStart = source.indexOf('const response: IUpscaleResponse =');
    const successResponse = source.slice(
      responseStart,
      source.indexOf('// Get updated batch usage', responseStart)
    );

    expect(successResponse).toContain('reservationJobId');
    expect(successResponse).toContain('deliveryToken');
    expect(successResponse).not.toContain('imageUrl:');
    expect(successResponse).not.toContain('imageData:');
    expect(successResponse).not.toContain('result.imageUrl');
    expect(successResponse).not.toContain('result.imageData');
  });

  it('marks the plaintext output capability response as non-cacheable and referrer-safe', () => {
    const source = routeSource();
    const returnBlock = source.slice(
      source.indexOf('return NextResponse.json(response'),
      source.indexOf('});', source.indexOf('return NextResponse.json(response'))
    );

    expect(returnBlock).toContain("'Cache-Control': 'no-store'");
    expect(returnBlock).toContain("'Referrer-Policy': 'no-referrer'");
    expect(returnBlock).toContain('X-Batch-Limit');
  });
});
