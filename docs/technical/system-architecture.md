# System Architecture

High-level architecture overview for PixelPerfect AI Image Enhancer.

## Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Browser]
        MOBILE[Mobile Browser]
        EXT_API[External API Clients]
    end

    subgraph "Edge Layer - Cloudflare"
        CDN[CDN]
        WORKERS[Workers Runtime]
        R2[R2 Storage]
    end

    subgraph "Application Layer - Next.js"
        PAGES[Pages/App Router]
        API[API Routes]
        MW[Middleware]
    end

    subgraph "Service Layer"
        AUTH[Supabase Auth]
        DB[(PostgreSQL)]
        STRIPE[Stripe]
        REPLICATE[Replicate AI]
    end

    subgraph "AI Processing"
        NANO[Nano Banana]
        ESRGAN[Real-ESRGAN]
    end

    WEB --> CDN
    MOBILE --> CDN
    EXT_API --> CDN

    CDN --> WORKERS
    WORKERS --> PAGES
    WORKERS --> API

    PAGES --> AUTH
    API --> MW
    MW --> AUTH
    MW --> DB
    MW --> STRIPE

    API --> REPLICATE
    API --> R2

    REPLICATE --> NANO
    REPLICATE --> ESRGAN

    R2 --> CDN
```

## Component Architecture

```mermaid
graph LR
    subgraph "Frontend Components"
        LP[Landing Page]
        UP[Upscaler Page]
        DASH[Dashboard]
        BILL[Billing]
        AUTH_UI[Auth UI]
    end

    subgraph "Shared Components"
        IMG_UP[Image Uploader]
        COMPARE[Before/After Compare]
        PROGRESS[Progress Indicator]
        MODAL[Modal System]
    end

    subgraph "State Management"
        CONTEXT[React Context]
        HOOKS[Custom Hooks]
        CACHE[SWR Cache]
    end

    LP --> IMG_UP
    UP --> IMG_UP
    UP --> COMPARE
    UP --> PROGRESS

    DASH --> CACHE
    BILL --> MODAL

    IMG_UP --> HOOKS
    COMPARE --> CONTEXT
    AUTH_UI --> CONTEXT
```

## Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant CDN as Cloudflare CDN
    participant Worker as Edge Worker
    participant App as Next.js
    participant Auth as Supabase Auth
    participant DB as PostgreSQL
    participant AI as Replicate
    participant Storage as R2

    Client->>CDN: HTTPS Request
    CDN->>Worker: Route Request

    alt Static Asset
        Worker->>CDN: Serve from Cache
        CDN-->>Client: Cached Response
    end

    alt API Request
        Worker->>App: Forward to API Route
        App->>Auth: Verify JWT
        Auth-->>App: User Context

        App->>DB: Query/Update
        DB-->>App: Data

        opt Image Processing
            App->>Storage: Store Input
            App->>AI: Process Request
            AI-->>App: Result
            App->>Storage: Store Output
        end

        App-->>Worker: JSON Response
        Worker-->>Client: Response
    end
```

## Data Flow Architecture

```mermaid
flowchart LR
    subgraph "Input Sources"
        UPLOAD[User Upload]
        API_IN[API Request]
        BATCH[Batch Upload]
    end

    subgraph "Processing Pipeline"
        VALIDATE[Validation]
        QUEUE[Job Queue]
        PROCESS[AI Processing]
        POST[Post-Processing]
    end

    subgraph "Storage"
        INPUT_S3[Input Storage]
        OUTPUT_S3[Output Storage]
        DB[(Database)]
    end

    subgraph "Output"
        DOWNLOAD[Direct Download]
        CDN_OUT[CDN Delivery]
        WEBHOOK[Webhook Callback]
    end

    UPLOAD --> VALIDATE
    API_IN --> VALIDATE
    BATCH --> VALIDATE

    VALIDATE --> QUEUE
    QUEUE --> INPUT_S3
    QUEUE --> PROCESS

    PROCESS --> POST
    POST --> OUTPUT_S3
    POST --> DB

    OUTPUT_S3 --> CDN_OUT
    CDN_OUT --> DOWNLOAD
    DB --> WEBHOOK
```

## Authentication Architecture

```mermaid
flowchart TD
    subgraph "Auth Providers"
        EMAIL[Email/Password]
        GOOGLE[Google OAuth]
        MAGIC[Magic Link]
    end

    subgraph "Supabase Auth"
        AUTH_SVC[Auth Service]
        JWT[JWT Tokens]
        SESSIONS[Session Store]
    end

    subgraph "Application"
        MW[Middleware]
        PROTECTED[Protected Routes]
        PUBLIC[Public Routes]
    end

    EMAIL --> AUTH_SVC
    GOOGLE --> AUTH_SVC
    MAGIC --> AUTH_SVC

    AUTH_SVC --> JWT
    AUTH_SVC --> SESSIONS

    JWT --> MW
    MW --> PROTECTED
    PUBLIC --> MW
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        LOCAL[Local Dev]
        PREVIEW[Preview Deployments]
    end

    subgraph "Production - Cloudflare"
        CF_DNS[DNS]
        CF_CDN[CDN/Cache]
        CF_WORKERS[Workers]
        CF_R2[R2 Storage]
    end

    subgraph "External Services"
        SUPABASE[Supabase Cloud]
        STRIPE_SVC[Stripe]
        REPLICATE_SVC[Replicate]
    end

    LOCAL --> PREVIEW
    PREVIEW --> CF_DNS

    CF_DNS --> CF_CDN
    CF_CDN --> CF_WORKERS
    CF_WORKERS --> CF_R2

    CF_WORKERS --> SUPABASE
    CF_WORKERS --> STRIPE_SVC
    CF_WORKERS --> REPLICATE_SVC
```

## Security Architecture

```mermaid
flowchart TD
    subgraph "Perimeter"
        WAF[Cloudflare WAF]
        DDOS[DDoS Protection]
        SSL[SSL/TLS]
    end

    subgraph "Application Security"
        CORS[CORS Policy]
        CSP[Content Security Policy]
        RATE[Rate Limiting]
        CSRF[CSRF Protection]
    end

    subgraph "Data Security"
        RLS[Row Level Security]
        ENCRYPT[Encryption at Rest]
        AUDIT[Audit Logging]
    end

    subgraph "Auth Security"
        JWT_VERIFY[JWT Verification]
        KEY_MGMT[API Key Management]
        MFA[MFA Ready]
    end

    WAF --> CORS
    DDOS --> RATE
    SSL --> CSP

    CORS --> JWT_VERIFY
    RATE --> KEY_MGMT
    CSRF --> RLS

    RLS --> ENCRYPT
    AUDIT --> ENCRYPT
```

## Scaling Architecture

```mermaid
graph TB
    subgraph "Horizontal Scaling"
        EDGE[Edge Locations]
        WORKERS_SCALE[Worker Instances]
    end

    subgraph "Vertical Scaling"
        DB_SCALE[Database Compute]
        AI_SCALE[AI Model Replicas]
    end

    subgraph "Caching Layers"
        CDN_CACHE[CDN Cache]
        APP_CACHE[Application Cache]
        DB_CACHE[Query Cache]
    end

    EDGE --> CDN_CACHE
    WORKERS_SCALE --> APP_CACHE
    DB_SCALE --> DB_CACHE
    AI_SCALE --> APP_CACHE
```

## Error Handling Architecture

```mermaid
flowchart TD
    ERROR[Error Occurs]

    ERROR --> TYPE{Error Type}

    TYPE -->|Client Error 4xx| CLIENT[Return Error Response]
    TYPE -->|Server Error 5xx| SERVER[Log & Retry]
    TYPE -->|AI Error| AI_ERR[Fallback Model]
    TYPE -->|Network Error| NET_ERR[Queue for Retry]

    SERVER --> SENTRY[Send to Sentry]
    AI_ERR --> SENTRY
    NET_ERR --> SENTRY

    SENTRY --> ALERT[Alert Team]

    CLIENT --> USER[Show User Message]
    SERVER --> USER
    AI_ERR --> USER
    NET_ERR --> USER
```

## Monitoring & Observability

```mermaid
graph LR
    subgraph "Data Sources"
        LOGS[Application Logs]
        METRICS[Performance Metrics]
        TRACES[Request Traces]
        ERRORS[Error Reports]
    end

    subgraph "Collection"
        SENTRY[Sentry]
        ANALYTICS[Vercel Analytics]
        CF_ANALYTICS[Cloudflare Analytics]
    end

    subgraph "Visualization"
        DASHBOARD[Dashboards]
        ALERTS[Alert System]
    end

    LOGS --> SENTRY
    ERRORS --> SENTRY
    METRICS --> ANALYTICS
    METRICS --> CF_ANALYTICS
    TRACES --> ANALYTICS

    SENTRY --> DASHBOARD
    ANALYTICS --> DASHBOARD
    CF_ANALYTICS --> DASHBOARD

    DASHBOARD --> ALERTS
```
