import { type ReactElement } from 'react';

interface IJsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: IJsonLdProps): ReactElement {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
