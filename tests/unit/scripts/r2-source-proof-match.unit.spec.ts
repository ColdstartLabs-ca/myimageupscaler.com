import { describe, expect, it } from 'vitest';
import { assertSourceMatchesProof } from '../../../scripts/storage/verify-r2-references.mjs';

const row = (bucket_id: string, name: string, version = 'v1') => ({ bucket_id, name, version });
const proofOf = (...rows: ReturnType<typeof row>[]) =>
  new Map(rows.map(r => [`${r.bucket_id}::${r.name}`, { ...r }]));

describe('assertSourceMatchesProof', () => {
  const saved = row('saved-images', 'u/a.webp');
  const input = row('upscale-inputs', 'u/in.png');

  it('accepts an exact match', () => {
    expect(() => assertSourceMatchesProof([saved, input], proofOf(saved, input))).not.toThrow();
  });

  it('accepts new delta inputs created after the proof', () => {
    const extra = row('upscale-inputs', 'u/new.png');
    expect(() => assertSourceMatchesProof([saved, input, extra], proofOf(saved, input))).not.toThrow();
  });

  it('rejects new objects in referenced buckets', () => {
    for (const bucket of ['saved-images', 'blog-images']) {
      const extra = row(bucket, 'u/new.webp');
      expect(() => assertSourceMatchesProof([saved, extra], proofOf(saved))).toThrow(/differs/);
    }
  });

  it('rejects a changed or missing proof object, including inputs', () => {
    expect(() => assertSourceMatchesProof([row('saved-images', 'u/a.webp', 'v2')], proofOf(saved))).toThrow(/differs/);
    expect(() => assertSourceMatchesProof([row('upscale-inputs', 'u/in.png', 'v2')], proofOf(input))).toThrow(/differs/);
    expect(() => assertSourceMatchesProof([saved], proofOf(saved, input))).toThrow(/complete source object proof/);
  });

  it('rejects duplicates and a missing proof', () => {
    expect(() => assertSourceMatchesProof([saved, saved], proofOf(saved))).toThrow(/differs/);
    expect(() => assertSourceMatchesProof([saved], undefined)).toThrow(/complete source object proof/);
  });
});
