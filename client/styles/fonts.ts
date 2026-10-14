import localFont from 'next/font/local';

// Self-hosted latin variable fonts (from Google Fonts). next/font/google fetches
// at build time, and a bad Google response there fails the whole build.
export const inter = localFont({
  src: './fonts/inter-latin-wght.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
});

export const dmSans = localFont({
  src: './fonts/dm-sans-latin-wght.woff2',
  weight: '100 1000',
  variable: '--font-dm-sans',
  display: 'swap',
});
