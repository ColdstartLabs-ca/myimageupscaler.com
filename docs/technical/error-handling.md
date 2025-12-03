# Error Handling System

**Last Updated:** December 2, 2025

## Overview

The application implements a comprehensive error handling system using React Error Boundaries and Next.js error pages to prevent blank screens and provide user-friendly error messages.

## Error Boundary Architecture

### 1. Reusable ErrorBoundary Component

**Location:** `client/components/errors/ErrorBoundary.tsx`

A class-based React component that catches JavaScript errors anywhere in the child component tree.

**Features:**

- Catches and logs errors with full stack traces
- Integrates with Baselime monitoring
- Shows detailed error info in development mode
- Provides "Try Again" and "Go Home" actions
- Supports custom fallback UI via props

**Usage:**

```tsx
import { ErrorBoundary } from '@/client/components/errors/ErrorBoundary';

<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>

// With custom fallback
<ErrorBoundary
  fallback={(error, resetError) => (
    <CustomErrorUI error={error} onRetry={resetError} />
  )}
>
  <YourComponent />
</ErrorBoundary>
```

### 2. Next.js App Router Error Pages

Next.js 15 App Router uses special `error.tsx` files for route-level error handling.

#### Global Error Page

**Location:** `app/error.tsx`

- Catches errors at the root level
- Full-screen error page
- Logs to monitoring service
- Shows error details in development

#### Dashboard Error Page

**Location:** `app/dashboard/error.tsx`

- Catches errors in `/dashboard/*` routes
- Contextual dashboard error UI
- Maintains dashboard layout
- Links back to dashboard home

#### Admin Panel Error Page

**Location:** `app/dashboard/admin/error.tsx`

- Catches errors in `/dashboard/admin/*` routes
- Admin-specific error styling
- Links back to admin panel home
- Enhanced logging for admin operations

## 404 Not Found Pages

### Global 404 Page

**Location:** `app/not-found.tsx`

- Shown when route doesn't exist
- Large "404" display with search icon
- Links to home and dashboard
- Full-screen centered layout

## Error Handling Hierarchy

```
┌─────────────────────────────────────────┐
│         app/error.tsx (Global)          │
│         Catches root-level errors       │
└─────────────────────────────────────────┘
              │
              ├─ /dashboard
              │  ├─ app/dashboard/error.tsx
              │  │  (Dashboard errors)
              │  │
              │  └─ /admin
              │     └─ app/dashboard/admin/error.tsx
              │        (Admin panel errors)
              │
              └─ 404 Errors
                 └─ app/not-found.tsx
```

## Error Props in Next.js Error Pages

Next.js error pages receive these props:

```tsx
{
  error: Error & { digest?: string };
  reset: () => void;
}
```

- `error`: The error object with optional digest for tracking
- `reset()`: Function to retry rendering the component

## Monitoring Integration

All error boundaries automatically log to Baselime monitoring if available:

```typescript
if (typeof window !== 'undefined' && (window as any).baselime) {
  (window as any).baselime.logError(error, {
    digest: error.digest,
    boundary: 'boundary-name',
    route: window.location.pathname,
  });
}
```

## Development vs Production

### Development Mode

- Full error messages displayed
- Stack traces visible in collapsible details
- Error digest shown
- Component stack trace included

### Production Mode

- User-friendly generic messages
- No technical details exposed
- Errors logged to monitoring
- Users see actionable recovery options

## Best Practices

### 1. Always Use Error Boundaries for Client Components

Wrap client components that may throw errors:

```tsx
<ErrorBoundary>
  <DataFetchingComponent />
</ErrorBoundary>
```

### 2. Handle API Errors Explicitly

Don't rely on error boundaries for expected API failures:

```tsx
const [error, setError] = useState<string | null>(null);

try {
  const data = await fetch('/api/endpoint');
  // handle success
} catch (err) {
  setError(err.message); // Show inline error
}
```

### 3. Log Errors Consistently

Always log errors before displaying to users:

```tsx
console.error('Operation failed:', error);
// Then show user-friendly message
```

### 4. Provide Recovery Actions

Every error UI should offer:

- "Try Again" button to retry the operation
- Navigation to a safe location (home, dashboard)
- Clear explanation of what happened

## Testing Error Boundaries

### Manual Testing

Create a test component that throws:

```tsx
function ErrorTest() {
  throw new Error('Test error boundary');
}

// Use in any page to test
<ErrorBoundary>
  <ErrorTest />
</ErrorBoundary>;
```

### Check Error Recovery

1. Navigate to any page
2. Trigger an error
3. Click "Try Again" - component should re-render
4. Verify error is logged to console
5. In production, verify error appears in Baselime

## Future Enhancements

- [ ] Error reporting form for users
- [ ] Offline error queueing
- [ ] Error analytics dashboard
- [ ] A/B testing different error messages
- [ ] Automatic error recovery with retry logic

## Related Documentation

- [Monitoring Setup](./monitoring.md)
- [API Error Handling](./api-reference.md#error-handling)
- [User Experience Guidelines](../management/ux-guidelines.md)
