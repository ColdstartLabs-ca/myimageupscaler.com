import { z } from 'zod';

export const sendEmailSchema = z.object({
  to: z.string().email('Invalid email address'),
  template: z.enum([
    'welcome',
    'payment-success',
    'subscription-update',
    'low-credits',
    'lifecycle-welcome',
    'feature-reminder',
    'blog-education',
    'unused-credits',
    'finish-image',
    'win-back',
    'password-reset',
  ]),
  data: z.record(z.unknown()).default({}),
  type: z.enum(['transactional', 'marketing']).default('transactional'),
});

export type ISendEmailInput = z.infer<typeof sendEmailSchema>;

export const updatePreferencesSchema = z.object({
  marketing_emails: z.boolean().optional(),
  product_updates: z.boolean().optional(),
  low_credit_alerts: z.boolean().optional(),
});

export type IUpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
