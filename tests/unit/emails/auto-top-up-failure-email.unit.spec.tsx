import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AutoTopUpFailureEmail } from '@/emails/templates/AutoTopUpFailureEmail';

describe('AutoTopUpFailureEmail', () => {
  it('states that credits were unchanged and links billing settings', () => {
    const { getByText, getByRole } = render(
      <AutoTopUpFailureEmail baseUrl="https://myimageupscaler.com" paused />
    );
    expect(getByText(/credits were not changed/i)).toBeTruthy();
    expect(getByText(/has been paused/i)).toBeTruthy();
    expect(getByRole('link', { name: /review billing settings/i })).toHaveAttribute(
      'href',
      'https://myimageupscaler.com/dashboard/billing'
    );
  });
});
