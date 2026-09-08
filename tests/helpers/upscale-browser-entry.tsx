import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  PathnameContext,
  PathParamsContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import Workspace from '@client/components/features/workspace/Workspace';
import { useUserData } from '@client/store/userStore';
import { createClient } from '@shared/utils/supabase/client';
import workspace from '@/locales/en/workspace.json';
import common from '@/locales/en/common.json';
import auth from '@/locales/en/auth.json';
import pricing from '@/locales/en/pricing.json';
import stripe from '@/locales/en/stripe.json';

const router = {
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => location.reload(),
  push: (url: string) => location.assign(url),
  replace: (url: string) => location.replace(url),
  prefetch: async () => undefined,
};

function FixtureWorkspace() {
  const { totalCredits, profile } = useUserData();
  return (
    <>
      <header className="p-4 text-foreground">
        <span data-testid="fixture-balance">{totalCredits}</span> credits
      </header>
      <main className="p-2 md:p-6" data-testid="fixture-account" data-account={profile?.id}>
        <Workspace />
      </main>
    </>
  );
}

// Exercise the same Supabase session event used by sign-in without replacing
// account, queue, balance or recovery state in the production stores.
Object.assign(window, {
  __upscaleFixtureSetSession: (session: { access_token: string; refresh_token: string }) =>
    createClient().auth.setSession(session),
});

createRoot(document.getElementById('root')!).render(
  <AppRouterContext.Provider value={router}>
    <PathnameContext.Provider value="/dashboard">
      <PathParamsContext.Provider value={{}}>
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <NextIntlClientProvider
            locale="en"
            timeZone="UTC"
            messages={{ workspace, common, auth, pricing, stripe }}
          >
            <FixtureWorkspace />
          </NextIntlClientProvider>
        </SearchParamsContext.Provider>
      </PathParamsContext.Provider>
    </PathnameContext.Provider>
  </AppRouterContext.Provider>
);
