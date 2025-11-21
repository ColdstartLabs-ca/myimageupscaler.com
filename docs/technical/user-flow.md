# User Flows

Detailed user journey diagrams for PixelPerfect's core features.

## 1. First-Time User (Freemium)

```mermaid
flowchart TD
    A[Landing Page] --> B{Has Account?}
    B -->|No| C[Try Free Button]
    B -->|Yes| D[Login]

    C --> E[Upload Image]
    E --> F[Select Processing Mode]
    F --> G[Process Image]
    G --> H[View Before/After]
    H --> I{Satisfied?}

    I -->|Yes| J[Download Result]
    I -->|No| K[Adjust Settings]
    K --> G

    J --> L{Create Account?}
    L -->|Yes| M[Sign Up]
    L -->|No| N[Continue as Guest]

    M --> O[Dashboard]
    N --> P{Free Credits Left?}
    P -->|Yes| E
    P -->|No| Q[Upgrade Prompt]
    Q --> R[Pricing Page]
```

## 2. Registration & Authentication

```mermaid
flowchart TD
    A[Auth Page] --> B{Method}

    B -->|Email/Password| C[Enter Email & Password]
    C --> D[Submit Form]
    D --> E[Create Account in Supabase]
    E --> F[Send Verification Email]
    F --> G[Show Verification Notice]
    G --> H[User Clicks Email Link]
    H --> I[Email Verified]
    I --> J[Redirect to Dashboard]

    B -->|Google OAuth| K[Click Google Button]
    K --> L[Redirect to Google]
    L --> M[User Consents]
    M --> N[Google Callback]
    N --> O{Existing User?}
    O -->|Yes| P[Link Account]
    O -->|No| Q[Create New Account]
    P --> J
    Q --> R[Auto-create Profile]
    R --> J

    B -->|Magic Link| S[Enter Email]
    S --> T[Send Magic Link]
    T --> U[User Clicks Link]
    U --> V[Verify Token]
    V --> J
```

## 3. Image Processing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as API Route
    participant DB as Supabase
    participant AI as Replicate
    participant R2 as Cloudflare R2

    U->>FE: Upload Image
    FE->>FE: Validate (size, format)
    FE->>API: POST /api/upscale

    API->>DB: Verify JWT & Get User
    DB-->>API: User Profile + Credits

    alt Insufficient Credits
        API-->>FE: 402 Payment Required
        FE-->>U: Upgrade Prompt
    end

    API->>R2: Store Input Image
    R2-->>API: Input Path

    API->>DB: Create Processing Job
    API->>DB: Deduct Credits

    API->>AI: Submit to Nano Banana
    AI-->>API: Processing Started

    loop Poll Status
        API->>AI: Check Status
        AI-->>API: Status Update
    end

    AI-->>API: Completed + Output URL
    API->>R2: Store Output Image
    R2-->>API: Output Path

    API->>DB: Update Job (completed)
    API-->>FE: Success + Image URLs
    FE-->>U: Show Before/After
```

## 4. Subscription Purchase

```mermaid
flowchart TD
    A[Dashboard] --> B[Click Upgrade]
    B --> C[Pricing Modal]
    C --> D{Select Plan}

    D -->|Starter $9| E[100 Credits/month]
    D -->|Pro $29| F[500 Credits/month]
    D -->|Business $99| G[2500 Credits/month]

    E --> H[Stripe Checkout]
    F --> H
    G --> H

    H --> I[Enter Payment Details]
    I --> J{Payment Success?}

    J -->|Yes| K[Stripe Webhook]
    K --> L[checkout.session.completed]
    L --> M[Update Profile]
    M --> N[Add Credits]
    N --> O[Create Subscription Record]
    O --> P[Redirect to Success Page]
    P --> Q[Dashboard with New Credits]

    J -->|No| R[Show Error]
    R --> I
```

## 5. Batch Processing (Pro/Business)

```mermaid
flowchart TD
    A[Upscaler Page] --> B[Enable Batch Mode]
    B --> C[Drag & Drop Multiple Images]
    C --> D{Validate All}

    D -->|Invalid Files| E[Show Errors]
    E --> C

    D -->|Valid| F[Select Processing Mode]
    F --> G[Select Output Format]
    G --> H[Submit Batch]

    H --> I{Sufficient Credits?}
    I -->|No| J[Upgrade Prompt]
    J --> K[Pricing Page]

    I -->|Yes| L[Create Batch Job]
    L --> M[Queue All Images]

    M --> N[Process Each Image]
    N --> O[Update Progress Bar]
    O --> P{All Complete?}

    P -->|No| N
    P -->|Yes| Q[Generate ZIP]
    Q --> R[Show Results Gallery]
    R --> S{Download?}

    S -->|Individual| T[Download Single]
    S -->|All| U[Download ZIP]
```

## 6. Subscription Management

```mermaid
stateDiagram-v2
    [*] --> Free: New User
    Free --> Starter: Purchase
    Free --> Pro: Purchase
    Free --> Business: Purchase

    Starter --> Pro: Upgrade
    Starter --> Free: Cancel
    Starter --> Starter: Renew

    Pro --> Business: Upgrade
    Pro --> Starter: Downgrade
    Pro --> Free: Cancel
    Pro --> Pro: Renew

    Business --> Pro: Downgrade
    Business --> Free: Cancel
    Business --> Business: Renew

    state "Cancellation Flow" as cancel {
        Active --> PendingCancel: Request Cancel
        PendingCancel --> Canceled: Period Ends
        PendingCancel --> Active: Reactivate
    }
```

## 7. Credit System Flow

```mermaid
flowchart TD
    subgraph "Credit Sources"
        A[Free Signup +10]
        B[Subscription Renewal]
        C[One-time Purchase]
        D[Referral Bonus]
        E[Refund]
    end

    subgraph "Credit Pool"
        F[(credits_balance)]
    end

    subgraph "Credit Usage"
        G[Standard Process -1]
        H[Enhanced Process -2]
        I[Batch Process -N]
        J[API Call -1]
    end

    A --> F
    B --> F
    C --> F
    D --> F
    E --> F

    F --> G
    F --> H
    F --> I
    F --> J

    G --> K{Credits > 0?}
    H --> K
    I --> K
    J --> K

    K -->|Yes| L[Process]
    K -->|No| M[Upgrade Required]
```

## 8. Error Recovery Flow

```mermaid
flowchart TD
    A[Processing Failed] --> B{Error Type}

    B -->|Timeout| C[Auto-retry x3]
    C --> D{Success?}
    D -->|Yes| E[Return Result]
    D -->|No| F[Refund Credit]

    B -->|Invalid Image| G[Show Error Message]
    G --> H[Suggest Fixes]
    H --> I[User Re-uploads]

    B -->|AI Model Error| J[Fallback Model]
    J --> K{Fallback Success?}
    K -->|Yes| E
    K -->|No| F

    B -->|Rate Limited| L[Queue for Later]
    L --> M[Notify When Ready]

    F --> N[Log Transaction]
    N --> O[Email User]
    O --> P[Support Ticket Option]
```

## 9. API Integration Flow (Business Tier)

```mermaid
sequenceDiagram
    participant App as External App
    participant API as PixelPerfect API
    participant Auth as Auth Middleware
    participant DB as Database
    participant AI as Replicate

    App->>API: POST /api/v1/upscale
    Note over App,API: Headers: Authorization: Bearer <api_key>

    API->>Auth: Validate API Key
    Auth->>DB: Lookup Key + User
    DB-->>Auth: User Profile

    alt Invalid Key
        Auth-->>App: 401 Unauthorized
    end

    alt Insufficient Credits
        Auth-->>App: 402 Payment Required
    end

    API->>AI: Process Image
    AI-->>API: Result

    API->>DB: Deduct Credit
    API->>DB: Log API Usage

    API-->>App: 200 OK + Result URL

    Note over App: Webhook (optional)
    API--)App: POST webhook_url
```

## 10. Session & Token Flow

```mermaid
sequenceDiagram
    participant Browser
    participant App as Next.js App
    participant Supabase

    Browser->>App: Visit /login
    App->>Browser: Show Login Form
    Browser->>App: Submit Credentials
    App->>Supabase: signInWithPassword()
    Supabase-->>App: JWT + Refresh Token
    App->>Browser: Set HttpOnly Cookies

    Note over Browser,Supabase: Subsequent Requests

    Browser->>App: Request /api/upscale
    App->>App: Read JWT from Cookie
    App->>Supabase: Verify JWT
    Supabase-->>App: Valid + User Data
    App->>App: Process Request
    App-->>Browser: Response

    Note over Browser,Supabase: Token Refresh

    Browser->>App: Request (Token Near Expiry)
    App->>Supabase: Refresh Token
    Supabase-->>App: New JWT
    App->>Browser: Update Cookie
```
