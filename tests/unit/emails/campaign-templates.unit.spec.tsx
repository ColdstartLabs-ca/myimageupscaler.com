import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';

// Non-converter templates
import { ResultReadyEmail } from '@/emails/templates/ResultReadyEmail';
import { PremiumTrialEmail } from '@/emails/templates/PremiumTrialEmail';
import { FeatureShowcaseEmail } from '@/emails/templates/FeatureShowcaseEmail';
import { WinBackEmail } from '@/emails/templates/WinBackEmail';

// Non-uploader templates
import { GettingStartedEmail } from '@/emails/templates/GettingStartedEmail';
import { PossibilityShowcaseEmail } from '@/emails/templates/PossibilityShowcaseEmail';
import { OneClickTryEmail } from '@/emails/templates/OneClickTryEmail';

// Trial user templates
import { TrialProgressEmail } from '@/emails/templates/TrialProgressEmail';
import { TrialReminderEmail } from '@/emails/templates/TrialReminderEmail';
import { TrialEndingEmail } from '@/emails/templates/TrialEndingEmail';
import { TrialExpiredEmail } from '@/emails/templates/TrialExpiredEmail';

const defaultProps = {
  baseUrl: 'https://myimageupscaler.com',
  supportEmail: 'support@myimageupscaler.com',
  appName: 'MyImageUpscaler',
  userName: 'Test User',
  unsubscribeToken: 'test-unsubscribe-token-123',
};

describe('Campaign Email Templates', () => {
  describe('Non-Converter Templates', () => {
    describe('ResultReadyEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<ResultReadyEmail {...defaultProps} />);
        expect(html).toContain('Your Upscaled Image is Ready');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<ResultReadyEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });

    describe('PremiumTrialEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<PremiumTrialEmail {...defaultProps} />);
        expect(html).toContain('Try Premium Features Free');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<PremiumTrialEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });

      it('should include premium features', async () => {
        const html = await render(<PremiumTrialEmail {...defaultProps} />);
        expect(html).toContain('4x upscaling');
        expect(html).toContain('Batch processing');
      });
    });

    describe('FeatureShowcaseEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<FeatureShowcaseEmail {...defaultProps} />);
        expect(html).toContain('See What You&#x27;re Missing');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<FeatureShowcaseEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });

    describe('WinBackEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<WinBackEmail {...defaultProps} />);
        expect(html).toContain('We Miss You');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<WinBackEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });
  });

  describe('Non-Uploader Templates', () => {
    describe('GettingStartedEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<GettingStartedEmail {...defaultProps} />);
        expect(html).toContain('Getting Started with AI Upscaling');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<GettingStartedEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });

    describe('PossibilityShowcaseEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<PossibilityShowcaseEmail {...defaultProps} />);
        // HTML encodes apostrophe as &#x27;
        expect(html).toContain('See What&#x27;s Possible');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<PossibilityShowcaseEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });

    describe('OneClickTryEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<OneClickTryEmail {...defaultProps} />);
        expect(html).toContain('Try It With One Click');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<OneClickTryEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });
  });

  describe('Trial User Templates', () => {
    describe('TrialProgressEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<TrialProgressEmail {...defaultProps} />);
        expect(html).toContain('Your Trial is Progressing');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<TrialProgressEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });

    describe('TrialReminderEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<TrialReminderEmail {...defaultProps} />);
        expect(html).toContain('Your Trial is Halfway Through');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<TrialReminderEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });

    describe('TrialEndingEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<TrialEndingEmail {...defaultProps} />);
        expect(html).toContain('Your Trial Ends Tomorrow');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<TrialEndingEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });

    describe('TrialExpiredEmail', () => {
      it('should render with default props', async () => {
        const html = await render(<TrialExpiredEmail {...defaultProps} />);
        expect(html).toContain('Your Trial Has Ended');
        expect(html).toMatchSnapshot();
      });

      it('should include unsubscribe link', async () => {
        const html = await render(<TrialExpiredEmail {...defaultProps} />);
        expect(html).toContain('/api/campaigns/unsubscribe?token=test-unsubscribe-token-123');
      });
    });
  });

  describe('All Templates', () => {
    it('should all include proper footer with copyright year', async () => {
      const templates = [
        <ResultReadyEmail key="result" {...defaultProps} />,
        <PremiumTrialEmail key="premium" {...defaultProps} />,
        <FeatureShowcaseEmail key="feature" {...defaultProps} />,
        <WinBackEmail key="winback" {...defaultProps} />,
        <GettingStartedEmail key="getting" {...defaultProps} />,
        <PossibilityShowcaseEmail key="possibility" {...defaultProps} />,
        <OneClickTryEmail key="oneclick" {...defaultProps} />,
        <TrialProgressEmail key="progress" {...defaultProps} />,
        <TrialReminderEmail key="reminder" {...defaultProps} />,
        <TrialEndingEmail key="ending" {...defaultProps} />,
        <TrialExpiredEmail key="expired" {...defaultProps} />,
      ];

      const currentYear = new Date().getFullYear().toString();

      for (const template of templates) {
        const html = await render(template);
        expect(html).toContain(currentYear);
        expect(html).toContain('MyImageUpscaler');
      }
    });

    it('should all include support email link', async () => {
      const templates = [
        <ResultReadyEmail key="result" {...defaultProps} />,
        <PremiumTrialEmail key="premium" {...defaultProps} />,
        <FeatureShowcaseEmail key="feature" {...defaultProps} />,
        <WinBackEmail key="winback" {...defaultProps} />,
        <GettingStartedEmail key="getting" {...defaultProps} />,
        <PossibilityShowcaseEmail key="possibility" {...defaultProps} />,
        <OneClickTryEmail key="oneclick" {...defaultProps} />,
        <TrialProgressEmail key="progress" {...defaultProps} />,
        <TrialReminderEmail key="reminder" {...defaultProps} />,
        <TrialEndingEmail key="ending" {...defaultProps} />,
        <TrialExpiredEmail key="expired" {...defaultProps} />,
      ];

      const currentYear = new Date().getFullYear().toString();

      for (const template of templates) {
        const html = await render(template);
        expect(html).toContain('mailto:support@myimageupscaler.com');
        expect(html).toContain('Contact us');
      }
    });

    it('should all have valid HTML structure', async () => {
      const templates = [
        { name: 'ResultReadyEmail', component: <ResultReadyEmail {...defaultProps} /> },
        { name: 'PremiumTrialEmail', component: <PremiumTrialEmail {...defaultProps} /> },
        { name: 'FeatureShowcaseEmail', component: <FeatureShowcaseEmail {...defaultProps} /> },
        { name: 'WinBackEmail', component: <WinBackEmail {...defaultProps} /> },
        { name: 'GettingStartedEmail', component: <GettingStartedEmail {...defaultProps} /> },
        {
          name: 'PossibilityShowcaseEmail',
          component: <PossibilityShowcaseEmail {...defaultProps} />,
        },
        { name: 'OneClickTryEmail', component: <OneClickTryEmail {...defaultProps} /> },
        { name: 'TrialProgressEmail', component: <TrialProgressEmail {...defaultProps} /> },
        { name: 'TrialReminderEmail', component: <TrialReminderEmail {...defaultProps} /> },
        { name: 'TrialEndingEmail', component: <TrialEndingEmail {...defaultProps} /> },
        { name: 'TrialExpiredEmail', component: <TrialExpiredEmail {...defaultProps} /> },
      ];

      for (const { name, component } of templates) {
        const html = await render(component);
        expect(html).toContain('<!DOCTYPE html');
        expect(html).toContain('<html');
        expect(html).toContain('<head>');
        expect(html).toContain('<body');
        expect(html).toContain('</html>');
      }
    });

    it('should all include unsubscribe link with proper token', async () => {
      const templates = [
        { name: 'ResultReadyEmail', component: <ResultReadyEmail {...defaultProps} /> },
        { name: 'PremiumTrialEmail', component: <PremiumTrialEmail {...defaultProps} /> },
        { name: 'FeatureShowcaseEmail', component: <FeatureShowcaseEmail {...defaultProps} /> },
        { name: 'WinBackEmail', component: <WinBackEmail {...defaultProps} /> },
        { name: 'GettingStartedEmail', component: <GettingStartedEmail {...defaultProps} /> },
        {
          name: 'PossibilityShowcaseEmail',
          component: <PossibilityShowcaseEmail {...defaultProps} />,
        },
        { name: 'OneClickTryEmail', component: <OneClickTryEmail {...defaultProps} /> },
        { name: 'TrialProgressEmail', component: <TrialProgressEmail {...defaultProps} /> },
        { name: 'TrialReminderEmail', component: <TrialReminderEmail {...defaultProps} /> },
        { name: 'TrialEndingEmail', component: <TrialEndingEmail {...defaultProps} /> },
        { name: 'TrialExpiredEmail', component: <TrialExpiredEmail {...defaultProps} /> },
      ];

      for (const { name, component } of templates) {
        const html = await render(component);
        expect(html).toContain('/api/campaigns/unsubscribe?token=');
        expect(html).toContain('test-unsubscribe-token-123');
        expect(html).toContain('Unsubscribe from marketing emails');
      }
    });

    it('should handle missing unsubscribe token gracefully', async () => {
      const propsWithoutToken = {
        ...defaultProps,
        unsubscribeToken: undefined,
      };

      const templates = [
        <ResultReadyEmail key="result" {...propsWithoutToken} />,
        <PremiumTrialEmail key="premium" {...propsWithoutToken} />,
        <GettingStartedEmail key="getting" {...propsWithoutToken} />,
        <TrialProgressEmail key="progress" {...propsWithoutToken} />,
      ];

      for (const template of templates) {
        const html = await render(template);
        expect(html).toContain('Unsubscribe from marketing emails');
        expect(html).toContain('/dashboard/settings');
      }
    });
  });
});
