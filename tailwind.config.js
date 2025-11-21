/* eslint-disable import/no-default-export */
import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--color-primary))',
          hover: 'rgb(var(--color-primary-hover))',
        },
        foreground: 'rgb(var(--color-foreground))',
        muted: {
          foreground: 'rgb(var(--color-muted-foreground))',
        },
        border: 'rgb(var(--color-border))',
        error: 'rgb(var(--color-error))',
        background: 'rgb(var(--color-background))',
        card: 'rgb(var(--color-card))',
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: ['light'],
  },
};
