/**
 * Shared email styles for all campaign and transactional emails.
 *
 * Centralizes the common CSS-in-JS objects so templates
 * only define their own unique styles.
 */

export const emailStyles = {
  main: {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#3b82f6',
    padding: '24px',
    textAlign: 'center' as const,
  },
  logo: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0',
  },
  content: {
    padding: '32px 24px',
  },
  heading: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: '16px',
  },
  paragraph: {
    fontSize: '16px',
    lineHeight: '24px',
    color: '#334155',
    marginBottom: '16px',
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    padding: '12px 24px',
    display: 'inline-block' as const,
  },
  subtext: {
    fontSize: '14px',
    color: '#64748b',
    marginTop: '16px',
    marginBottom: '0',
  },
  hr: {
    borderColor: '#e2e8f0',
    margin: '0',
  },
  footer: {
    padding: '24px',
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: '14px',
    color: '#64748b',
    margin: '4px 0',
  },
  footerLink: {
    color: '#3b82f6',
    textDecoration: 'underline',
  },
} as const;
