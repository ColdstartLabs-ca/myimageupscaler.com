import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const tkm = require(
  path.resolve(process.cwd(), '.claude/skills/three-kings-manager/scripts/tkm.cjs')
) as {
  classify: (
    entry: unknown,
    metrics: unknown,
    today: string
  ) => { verdict: string; reason: string; nextRung: number | null };
  judgeEdits: (
    entry: { history: Array<Record<string, unknown>> },
    rows: unknown[],
    dataEnd: string
  ) => { judged: number; latestOutcome: string | null };
  windowClose: (date: string, days?: number) => string;
  cmdRecordEdit: (args: Record<string, string>) => void;
  cmdRecordRevert: (args: Record<string, string>) => void;
  RUNG_FIELDS: Record<number, string>;
  WINDOW_DAYS: number;
};

const mkRows = (spec: Array<[string, number, number, number]>) =>
  spec.map(([date, clicks, impressions, position]) => ({
    keys: [date, '/blog/x'],
    clicks,
    impressions,
    position,
  }));

const baseEntry = { url: '/blog/x', rung: 1, lastEdit: '2026-08-01', history: [], windowDays: 14 };

const healthyCurrent = { impressions: 8000, clicks: 120, position: 7.2 };
const healthyPrior = { impressions: 8000, clicks: 120, position: 7.0 };

describe('three-kings-manager window math', () => {
  it('closes the 14-day verdict window the day after 14 elapsed days', () => {
    expect(tkm.windowClose('2026-08-17')).toBe('2026-08-31');
  });

  it('window close is exclusive: the window is still open on day 13', () => {
    expect(tkm.windowClose('2026-08-17', 14) > '2026-08-30').toBe(true);
  });
});

describe('three-kings-manager classify gates', () => {
  it('HOLDs while the verdict window is open', () => {
    const v = tkm.classify(
      baseEntry,
      { current: healthyCurrent, prior: healthyPrior },
      '2026-08-14'
    );
    expect(v.verdict).toBe('HOLD');
    expect(v.reason).toContain('2026-08-15');
  });

  it('EDIT_NOW with next rung after the window closes', () => {
    const v = tkm.classify(
      baseEntry,
      { current: healthyCurrent, prior: healthyPrior },
      '2026-08-16'
    );
    expect(v.verdict).toBe('EDIT_NOW');
    expect(v.nextRung).toBe(2);
  });

  it('gates a demand change: impressions move, position stable', () => {
    const v = tkm.classify(
      baseEntry,
      {
        current: { impressions: 1000, clicks: 5, position: 6.5 },
        prior: { impressions: 4000, clicks: 20, position: 7.0 },
      },
      '2026-08-16'
    );
    expect(v.verdict).toBe('GATED');
    expect(v.reason).toContain('demand change');
  });

  it('gates the phantom/SERP-feature signature (huge impressions, ~zero CTR, pos 8-12)', () => {
    const v = tkm.classify(
      baseEntry,
      {
        current: { impressions: 45000, clicks: 2, position: 9.5 },
        prior: { impressions: 45000, clicks: 2, position: 9.6 },
      },
      '2026-08-16'
    );
    expect(v.verdict).toBe('GATED');
    expect(v.reason).toContain('phantom');
  });

  it('gates junk-position bloat: impressions up at position > 30', () => {
    const v = tkm.classify(
      baseEntry,
      {
        current: { impressions: 1200, clicks: 4, position: 54 },
        prior: { impressions: 500, clicks: 2, position: 55 },
      },
      '2026-08-16'
    );
    expect(v.verdict).toBe('GATED');
    expect(v.reason).toContain('bloat');
  });

  it('returns VERDICT after rung 3 completes', () => {
    const v = tkm.classify(
      { ...baseEntry, rung: 3 },
      { current: healthyCurrent, prior: healthyPrior },
      '2026-09-01'
    );
    expect(v.verdict).toBe('VERDICT');
  });

  it('STOP short-circuits everything', () => {
    const v = tkm.classify(
      { ...baseEntry, stopRule: { date: '2026-08-25', reason: 'phantom cluster' } },
      { current: healthyCurrent, prior: healthyPrior },
      '2026-09-01'
    );
    expect(v.verdict).toBe('STOP');
  });
});

describe('three-kings-manager edit outcomes', () => {
  it('judges WIN when post clicks/d reach 1.2x pre', () => {
    const entry = { history: [{ date: '2026-08-01', rung: 1, field: 'seo_title', outcome: null }] };
    const rows = mkRows([
      ...Array.from(
        { length: 14 },
        (_, i) =>
          [`2026-07-${String(18 + i).padStart(2, '0')}`, 10, 1000, 7] as [
            string,
            number,
            number,
            number,
          ]
      ),
      ...Array.from(
        { length: 14 },
        (_, i) =>
          [`2026-08-${String(1 + i).padStart(2, '0')}`, 25, 1000, 7] as [
            string,
            number,
            number,
            number,
          ]
      ),
    ]);
    const { judged, latestOutcome } = tkm.judgeEdits(entry, rows, '2026-09-03');
    expect(judged).toBe(1);
    expect(latestOutcome).toBe('WIN');
  });

  it('judges LOSS when post clicks/d fall below 0.8x pre', () => {
    const entry = { history: [{ date: '2026-08-01', rung: 1, field: 'seo_title', outcome: null }] };
    const rows = mkRows([
      ...Array.from(
        { length: 14 },
        (_, i) =>
          [`2026-07-${String(18 + i).padStart(2, '0')}`, 20, 1000, 7] as [
            string,
            number,
            number,
            number,
          ]
      ),
      ...Array.from(
        { length: 14 },
        (_, i) =>
          [`2026-08-${String(1 + i).padStart(2, '0')}`, 5, 1000, 7] as [
            string,
            number,
            number,
            number,
          ]
      ),
    ]);
    const { latestOutcome } = tkm.judgeEdits(entry, rows, '2026-09-03');
    expect(latestOutcome).toBe('LOSS');
  });

  it('judges LOSS on heavy position degradation without click gain', () => {
    const entry = { history: [{ date: '2026-08-01', rung: 1, field: 'seo_title', outcome: null }] };
    const rows = mkRows([
      ...Array.from(
        { length: 14 },
        (_, i) =>
          [`2026-07-${String(18 + i).padStart(2, '0')}`, 20, 1000, 7] as [
            string,
            number,
            number,
            number,
          ]
      ),
      ...Array.from(
        { length: 14 },
        (_, i) =>
          [`2026-08-${String(1 + i).padStart(2, '0')}`, 20, 1000, 12] as [
            string,
            number,
            number,
            number,
          ]
      ),
    ]);
    const { latestOutcome } = tkm.judgeEdits(entry, rows, '2026-09-03');
    expect(latestOutcome).toBe('LOSS');
  });

  it('leaves windows incomplete in the export as pending', () => {
    const entry = { history: [{ date: '2026-08-25', rung: 1, field: 'seo_title', outcome: null }] };
    const rows = mkRows(
      Array.from(
        { length: 7 },
        (_, i) => [`2026-09-0${1 + i}`, 5, 500, 8] as [string, number, number, number]
      )
    );
    const { judged } = tkm.judgeEdits(entry, rows, '2026-09-03');
    expect(judged).toBe(0);
  });
});

describe('three-kings-manager ledger commands', () => {
  const mkLedger = () => ({
    version: 1,
    windowDays: 14,
    entries: [
      {
        url: '/blog/x',
        label: '/blog/x',
        rung: 1,
        lastEdit: '2026-08-01',
        history: [],
        stopRule: null,
      },
    ],
  });

  it('record-edit advances the rung and opens the next window', () => {
    const ledger = mkLedger();
    const file = '/tmp/tkm-test-ledger.json';
    require('fs').writeFileSync(file, JSON.stringify(ledger));
    tkm.cmdRecordEdit({
      ledger: file,
      url: '/blog/x',
      rung: '2',
      note: 'new meta',
      date: '2026-08-20',
    });
    const saved = JSON.parse(require('fs').readFileSync(file, 'utf8'));
    expect(saved.entries[0].rung).toBe(2);
    expect(saved.entries[0].lastEdit).toBe('2026-08-20');
    expect(saved.entries[0].history).toHaveLength(1);
  });

  it('record-edit refuses same-page edits inside the open window', () => {
    const ledger = mkLedger();
    const file = '/tmp/tkm-test-ledger.json';
    require('fs').writeFileSync(file, JSON.stringify(ledger));
    expect(() =>
      tkm.cmdRecordEdit({ ledger: file, url: '/blog/x', rung: 2, date: '2026-08-10' })
    ).toThrow(/window still open/);
  });

  it('record-edit refuses skipping rungs', () => {
    const ledger = mkLedger();
    const file = '/tmp/tkm-test-ledger.json';
    require('fs').writeFileSync(file, JSON.stringify(ledger));
    expect(() =>
      tkm.cmdRecordEdit({ ledger: file, url: '/blog/x', rung: 3, date: '2026-08-20' })
    ).toThrow(/ladder violation/);
  });

  it('record-revert never advances the rung and opens the cooling-off window', () => {
    const ledger = mkLedger();
    const file = '/tmp/tkm-test-ledger.json';
    require('fs').writeFileSync(file, JSON.stringify(ledger));
    tkm.cmdRecordRevert({
      ledger: file,
      url: '/blog/x',
      note: 'restored prior title',
      date: '2026-08-20',
    });
    const saved = JSON.parse(require('fs').readFileSync(file, 'utf8'));
    expect(saved.entries[0].rung).toBe(1);
    expect(saved.entries[0].lastEdit).toBe('2026-08-20');
    expect(saved.entries[0].history[0].field).toBe('rollback');
  });
});

describe('three-kings-manager constants', () => {
  it('uses a 14-day window and 3 rungs', () => {
    expect(tkm.WINDOW_DAYS).toBe(14);
    expect(Object.keys(tkm.RUNG_FIELDS)).toEqual(['1', '2', '3']);
  });
});
