# Authentication System

Authentication and authorization implementation using Supabase Auth.

## Overview

```mermaid
graph TD
    subgraph "Auth Providers"
        EMAIL[Email/Password]
        GOOGLE[Google OAuth]
        MAGIC[Magic Link]
    end

    subgraph "Supabase Auth"
        AUTH_SVC[Auth Service]
        JWT[JWT Tokens]
        REFRESH[Refresh Tokens]
        SESSIONS[Session Store]
    end

    subgraph "Application Layer"
        MW[Middleware]
        CLIENT[Supabase Client]
        SERVER[Server Client]
    end

    EMAIL --> AUTH_SVC
    GOOGLE --> AUTH_SVC
    MAGIC --> AUTH_SVC

    AUTH_SVC --> JWT
    AUTH_SVC --> REFRESH
    AUTH_SVC --> SESSIONS

    JWT --> MW
    JWT --> CLIENT
    JWT --> SERVER
```

## Authentication Methods

### 1. Email/Password

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Supabase

    User->>App: Enter email + password
    App->>Supabase: signUp({ email, password })
    Supabase->>Supabase: Create user record
    Supabase->>User: Send verification email
    Supabase-->>App: { user, session: null }

    Note over User: User clicks email link

    User->>Supabase: Verify email token
    Supabase->>Supabase: Mark email verified
    Supabase-->>User: Redirect to app

    User->>App: Login with credentials
    App->>Supabase: signInWithPassword()
    Supabase-->>App: { user, session }
    App->>App: Store session in cookies
```

### 2. Google OAuth

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Supabase
    participant Google

    User->>App: Click "Sign in with Google"
    App->>Supabase: signInWithOAuth({ provider: 'google' })
    Supabase-->>User: Redirect to Google

    User->>Google: Authorize app
    Google-->>Supabase: Auth code
    Supabase->>Google: Exchange for tokens
    Google-->>Supabase: Access token + user info

    Supabase->>Supabase: Create/link user
    Supabase-->>App: Redirect with session
    App->>App: Handle callback, store session
```

### 3. Magic Link

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Supabase

    User->>App: Enter email
    App->>Supabase: signInWithOtp({ email })
    Supabase->>User: Send magic link email
    Supabase-->>App: { user: null }

    Note over User: User clicks magic link

    User->>Supabase: Verify OTP token
    Supabase-->>App: Redirect with session
    App->>App: Handle callback, store session
```

## Session Management

### Token Structure

```typescript
interface Session {
  access_token: string; // JWT (expires in 1 hour)
  refresh_token: string; // Long-lived (expires in 7 days)
  expires_at: number; // Unix timestamp
  expires_in: number; // Seconds until expiry
  token_type: 'bearer';
  user: User;
}

interface User {
  id: string; // UUID
  email: string;
  email_confirmed_at: string;
  created_at: string;
  updated_at: string;
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
  };
  app_metadata: {
    provider: string;
    providers: string[];
  };
}
```

### Token Refresh Flow

```mermaid
sequenceDiagram
    participant Client
    participant Middleware
    participant Supabase

    Client->>Middleware: Request with JWT
    Middleware->>Middleware: Check expiry

    alt Token Valid
        Middleware->>Middleware: Verify signature
        Middleware-->>Client: Continue request
    end

    alt Token Expired (< 60s)
        Middleware->>Supabase: Refresh token
        Supabase-->>Middleware: New JWT
        Middleware->>Middleware: Update cookies
        Middleware-->>Client: Continue with new token
    end

    alt Refresh Token Expired
        Middleware-->>Client: 401 Unauthorized
        Client->>Client: Redirect to login
    end
```

## Implementation

### Client-Side (Browser)

```typescript
// shared/utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Server-Side (API Routes)

```typescript
// shared/utils/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
```

### Middleware

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect routes
  const protectedPaths = ['/dashboard', '/upscaler', '/api/upscale'];
  const isProtected = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}
```

## Protected Routes

```mermaid
flowchart TD
    REQ[Incoming Request] --> MW{Middleware}

    MW -->|Public Route| PUBLIC[Continue]
    MW -->|Protected Route| CHECK{Has Valid JWT?}

    CHECK -->|Yes| VERIFY[Verify Token]
    CHECK -->|No| REDIRECT[Redirect to Login]

    VERIFY -->|Valid| INJECT[Inject User Context]
    VERIFY -->|Invalid| REDIRECT

    INJECT --> HANDLER[Route Handler]
```

### Route Protection Matrix

| Path              | Auth Required | Description       |
| ----------------- | ------------- | ----------------- |
| `/`               | No            | Landing page      |
| `/login`          | No            | Login page        |
| `/signup`         | No            | Registration page |
| `/pricing`        | No            | Pricing page      |
| `/dashboard`      | Yes           | User dashboard    |
| `/upscaler`       | Yes           | Processing page   |
| `/api/upscale`    | Yes           | Processing API    |
| `/api/checkout`   | Yes           | Billing API       |
| `/api/profile`    | Yes           | User API          |
| `/api/webhooks/*` | No            | Stripe webhooks   |

## Security Considerations

### JWT Validation

```mermaid
flowchart TD
    JWT[JWT Token] --> PARSE[Parse Header/Payload]
    PARSE --> CHECK_EXP{Expired?}

    CHECK_EXP -->|Yes| REJECT[Reject]
    CHECK_EXP -->|No| CHECK_SIG{Valid Signature?}

    CHECK_SIG -->|No| REJECT
    CHECK_SIG -->|Yes| CHECK_ISS{Valid Issuer?}

    CHECK_ISS -->|No| REJECT
    CHECK_ISS -->|Yes| ACCEPT[Accept]
```

### Security Headers

```typescript
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
};
```

### Cookie Configuration

```typescript
const cookieOptions = {
  httpOnly: true, // Prevent XSS access
  secure: true, // HTTPS only
  sameSite: 'lax', // CSRF protection
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};
```

## Error Handling

| Error Code            | Description           | User Action         |
| --------------------- | --------------------- | ------------------- |
| `invalid_credentials` | Wrong email/password  | Show error message  |
| `email_not_confirmed` | Email not verified    | Resend verification |
| `user_already_exists` | Duplicate email       | Redirect to login   |
| `invalid_grant`       | Expired refresh token | Force re-login      |
| `otp_expired`         | Magic link expired    | Request new link    |
