/**
 * Input-retention privacy copy guard for the ai-image-upscaler tool page.
 *
 * The old FAQ answer promised deletion "within 1 hour of processing". That was
 * false: the R2 `inputs/` lifecycle rule only schedules deletion two days after
 * upload, and Cloudflare may delete later than the scheduled expiry. This spec
 * pins the honest copy in both the localized tool data and the pSEO dataset,
 * forbids a hard deletion deadline, and guards the free-offer copy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface IToolQuestion {
  question: string;
  answer: string;
}

interface IToolPage {
  slug: string;
  commonQuestions: IToolQuestion[];
}

interface IToolData {
  pages: IToolPage[];
}

function load(relativePath: string): IToolData {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8')) as IToolData;
}

function privacyAnswer(data: IToolData): string {
  const page = data.pages.find(entry => entry.slug === 'ai-image-upscaler');
  const faq = page?.commonQuestions.find(
    entry => entry.question === 'Are my images stored on your servers?'
  );
  if (!faq) throw new Error('Missing ai-image-upscaler privacy FAQ entry');
  return faq.answer;
}

function freeOfferAnswer(data: IToolData): string {
  const page = data.pages.find(entry => entry.slug === 'ai-image-upscaler');
  const faq = page?.commonQuestions.find(
    entry => entry.question === 'How many images can I upscale for free?'
  );
  if (!faq) throw new Error('Missing ai-image-upscaler free-offer FAQ entry');
  return faq.answer;
}

const SOURCES = [
  'locales/en/tools.json',
  'app/seo/data/tools.json',
] as const;

describe.each(SOURCES)('ai-image-upscaler input-retention copy (%s)', source => {
  const data = load(source);

  it('does not promise deletion within one hour of processing', () => {
    expect(privacyAnswer(data)).not.toMatch(/1 hour|one hour/i);
  });

  it('does not promise deletion after processing or a hard deadline', () => {
    expect(privacyAnswer(data)).not.toMatch(/after processing|within 2 days|expire within/i);
  });

  it('states temporary uploads are scheduled for deletion after two days', () => {
    expect(privacyAnswer(data)).toMatch(/scheduled for automatic deletion after two days/i);
  });

  it('states cleanup may take longer than the scheduled deletion', () => {
    expect(privacyAnswer(data)).toMatch(/cleanup may take longer/i);
  });

  it('keeps gallery retention separate from temporary uploads', () => {
    expect(privacyAnswer(data)).toMatch(/separate retention policy/i);
  });

  it('preserves the free-offer copy', () => {
    expect(freeOfferAnswer(data)).toMatch(/free credits/i);
  });
});
