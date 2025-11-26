'use client';

import { BaselimeRum } from '@baselime/react-rum';
import { type ReactNode } from 'react';
import { clientEnv, isDevelopment } from '@shared/config/env';

interface IBaselimeProviderProps {
  children: ReactNode;
}

export function BaselimeProvider({ children }: IBaselimeProviderProps): ReactNode {
  const apiKey = clientEnv.BASELIME_KEY;

  // Skip Baselime in development or if no API key
  if (!apiKey || isDevelopment()) {
    return <>{children}</>;
  }

  return (
    <BaselimeRum
      apiKey={apiKey}
      enableWebVitals
      service="pixelperfect-web"
    >
      {children}
    </BaselimeRum>
  );
}
