import { describe, test, expect } from 'vitest';
import { parseGa4CookieContext } from '@shared/analytics/ga4-cookie-context';

describe('parseGa4CookieContext', () => {
  test('extracts client_id from a GA1 _ga cookie', () => {
    expect(parseGa4CookieContext('_ga=GA1.1.1234567890.1700000000')).toEqual({
      gaClientId: '1234567890.1700000000',
    });
  });

  test('extracts session_id from a GS1 _ga_ cookie', () => {
    expect(
      parseGa4CookieContext('_ga_ABC123=GS1.1.1700000001.3.0.0')
    ).toEqual({ gaSessionId: '1700000001' });
  });

  test('extracts session_id from a GS2 _ga_ cookie', () => {
    expect(
      parseGa4CookieContext('_ga_ABC123=GS2.1.s1700000002$o4$g0$t1700000002$j0$l0$h0')
    ).toEqual({ gaSessionId: '1700000002' });
  });

  test('combines client_id and session_id from separate cookies', () => {
    const header =
      'theme=dark; _ga=GA1.1.111.222; _ga_ABC123=GS1.1.333.1.0.0; locale=en';
    expect(parseGa4CookieContext(header)).toEqual({
      gaClientId: '111.222',
      gaSessionId: '333',
    });
  });

  test('picks the first valid _ga_ session cookie and ignores invalid ones', () => {
    const header = '_ga_BAD=GS1.not-a-session; _ga_OK=GS2.1.s444$o1';
    expect(parseGa4CookieContext(header)).toEqual({ gaSessionId: '444' });
  });

  test('omits invalid client_id values', () => {
    expect(parseGa4CookieContext('_ga=GA1.1.not-digits')).toEqual({});
    expect(parseGa4CookieContext('_ga=')).toEqual({});
  });

  test('omits invalid session_id values', () => {
    expect(parseGa4CookieContext('_ga_X=GS1.1.12abc.1')).toEqual({});
    expect(parseGa4CookieContext('_ga_X=garbage')).toEqual({});
  });

  test('returns an empty object for missing or empty headers', () => {
    expect(parseGa4CookieContext(null)).toEqual({});
    expect(parseGa4CookieContext(undefined)).toEqual({});
    expect(parseGa4CookieContext('')).toEqual({});
  });

  test('does not treat _ga itself as a session cookie and never throws on garbage', () => {
    expect(parseGa4CookieContext(';;;_ga=broken;; = ;other=1')).toEqual({});
  });
});
