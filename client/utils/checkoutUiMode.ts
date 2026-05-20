'use client';

export type TCheckoutUiMode = 'hosted' | 'embedded';

export function getCheckoutUiMode(): TCheckoutUiMode {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 'hosted' : 'embedded';
}
