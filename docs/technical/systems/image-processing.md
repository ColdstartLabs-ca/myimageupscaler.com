# Image Processing System

AI-powered image enhancement and upscaling using Gemini API / OpenRouter.

## Overview

The image processing system follows a simple, stateless flow: user uploads an image, it gets processed by the AI, and the result is returned directly for download. No images are stored on the server.

```mermaid
flowchart LR
    UPLOAD[User Upload] --> VALIDATE[Validation]
    VALIDATE --> PROCESS[AI Processing]
    PROCESS --> RETURN[Return Result]
    RETURN --> DOWNLOAD[User Downloads]
```

## Processing Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant DB as Supabase
    participant AI as Gemini API

    User->>Frontend: Upload image
    Frontend->>Frontend: Client-side validation

    Frontend->>API: POST /api/upscale
    API->>DB: Verify JWT & credits
    DB-->>API: User profile

    alt Insufficient Credits
        API-->>Frontend: 402 Payment Required
        Frontend-->>User: Show upgrade prompt
    end

    API->>API: Validate image (size, format)
    API->>AI: Send image + prompt
    AI-->>API: Processed image (base64/URL)

    API->>DB: Deduct credit
    API->>DB: Log transaction

    API-->>Frontend: Return processed image
    Frontend-->>User: Display result
    User->>Frontend: Download image
```

## AI Integration

### Primary Provider: Gemini API

```mermaid
graph TD
    subgraph "Gemini Models"
        FLASH[gemini-2.5-flash-image]
        PRO[gemini-3-pro-image-preview]
    end

    subgraph "Processing Modes"
        STD[Standard]
        ENH[Enhanced]
        PORT[Portrait]
        PROD[Product]
    end

    STD --> FLASH
    ENH --> FLASH
    PORT --> FLASH
    PROD --> FLASH

    PRO -.->|Premium Tier| ENH
```

### Error Handling

```mermaid
flowchart TD
    REQ[Processing Request] --> GEMINI{Gemini API}

    GEMINI -->|Success| RESULT[Return Result]
    GEMINI -->|Error/Timeout| REFUND[Refund Credit]

    REFUND --> ERROR[Return Error]
```

## API Request Structure

### Request

```typescript
interface UpscaleRequest {
  imageData: string; // Base64 encoded image data
  mimeType?: string; // Image MIME type (defaults to 'image/jpeg')
  config: {
    mode: ProcessingMode; // Processing mode
    scale: 2 | 4; // Upscale factor
    denoise?: boolean; // Apply denoising
    enhanceFace?: boolean; // Enhance facial features
    preserveText?: boolean; // Text/logo preservation
    customPrompt?: string; // Custom instructions (for custom mode)
  };
}

type ProcessingMode =
  | 'upscale' // Basic upscaling (1 credit)
  | 'enhance' // Quality enhancement (2 credits)
  | 'both' // Upscale + enhance combined (2 credits)
  | 'custom'; // Custom prompt (2 credits)
```

### Response

```typescript
interface UpscaleResponse {
  success: boolean;
  data: {
    imageUrl: string; // Direct URL to processed image
    imageBase64?: string; // Optional base64 data
    creditsUsed: number;
    processingTime: number; // Milliseconds
    metadata: {
      inputSize: { width: number; height: number };
      outputSize: { width: number; height: number };
      scale: number;
      mode: ProcessingMode;
    };
  };
}
```

## Prompt Engineering

### Text & Logo Preservation (Hero Feature)

```typescript
const buildPrompt = (options: ProcessingOptions): string => {
  const basePrompt = `Enhance and upscale this image by ${options.scale}x while maintaining quality.`;

  if (options.preserveText) {
    return `${basePrompt}
    IMPORTANT: Preserve all text, logos, labels, and brand elements with perfect clarity.
    Keep text sharp and readable. Do not modify, blur, or distort any text content.
    ${options.prompt || ''}`;
  }

  return `${basePrompt} ${options.prompt || ''}`;
};
```

### Mode-Specific Prompts

| Mode        | Prompt Focus                                        |
| ----------- | --------------------------------------------------- |
| **upscale** | Resolution increase, edge sharpening                |
| **enhance** | Quality refinement, artifact removal, color balance |
| **both**    | Combined upscaling and enhancement                  |
| **custom**  | User-defined prompt for specialized processing      |

## Validation

### Client-Side

```typescript
const VALIDATION_RULES = {
  maxSize: {
    free: 5 * 1024 * 1024, // 5MB
    paid: 25 * 1024 * 1024, // 25MB
  },
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  maxDimension: 8192, // Max width/height in pixels
  minDimension: 64, // Min width/height in pixels
};
```

### Server-Side

```mermaid
flowchart TD
    IMG[Image Data] --> SIZE{Size OK?}
    SIZE -->|No| ERR_SIZE[FILE_TOO_LARGE]
    SIZE -->|Yes| TYPE{Type OK?}

    TYPE -->|No| ERR_TYPE[INVALID_FILE]
    TYPE -->|Yes| DIM{Dimensions OK?}

    DIM -->|No| ERR_DIM[INVALID_DIMENSIONS]
    DIM -->|Yes| VALID[Valid]
```

## Credit System Integration

```mermaid
flowchart TD
    REQ[Request] --> CHECK{Credits >= Required?}

    CHECK -->|No| REJECT[402 Insufficient Credits]

    CHECK -->|Yes| RESERVE[Reserve Credits]
    RESERVE --> PROCESS[Process Image]

    PROCESS -->|Success| DEDUCT[Deduct Credits]
    PROCESS -->|Failure| RELEASE[Release Reserved]

    DEDUCT --> LOG[Log Transaction]
    RELEASE --> ERROR[Return Error]
```

### Credit Costs

| Mode    | Credits |
| ------- | ------- |
| upscale | 1       |
| enhance | 2       |
| both    | 2       |
| custom  | 2       |

## Error Handling

```mermaid
flowchart TD
    ERROR[Error Occurs] --> TYPE{Error Type}

    TYPE -->|Validation| VAL_ERR[400 Bad Request]
    TYPE -->|Auth| AUTH_ERR[401 Unauthorized]
    TYPE -->|Credits| CREDIT_ERR[402 Payment Required]
    TYPE -->|AI Timeout| TIMEOUT[Retry with Fallback]
    TYPE -->|AI Error| AI_ERR[Try Fallback Provider]
    TYPE -->|Unknown| INT_ERR[500 Internal Error]

    TIMEOUT -->|Fallback Success| SUCCESS[Return Result]
    TIMEOUT -->|Fallback Fail| REFUND[Refund & Error]

    AI_ERR -->|Fallback Success| SUCCESS
    AI_ERR -->|Fallback Fail| REFUND
```

### Error Responses

| Code                   | HTTP Status | Cause                 |
| ---------------------- | ----------- | --------------------- |
| `INVALID_FILE`         | 400         | Unsupported format    |
| `FILE_TOO_LARGE`       | 400         | Exceeds size limit    |
| `INVALID_DIMENSIONS`   | 400         | Image too small/large |
| `UNAUTHORIZED`         | 401         | Missing/invalid token |
| `INSUFFICIENT_CREDITS` | 402         | Not enough credits    |
| `PROCESSING_FAILED`    | 500         | AI processing error   |
| `AI_UNAVAILABLE`       | 503         | All providers down    |

## Performance

### Typical Processing Times

| Scale | Mode     | Approximate Time |
| ----- | -------- | ---------------- |
| 2x    | standard | 10-20s           |
| 4x    | standard | 15-30s           |
| 8x    | standard | 30-60s           |
| any   | enhanced | +10-20s          |

### Optimization Strategies

```mermaid
graph LR
    subgraph "Client"
        COMPRESS[Pre-compress large images]
        PREVIEW[Show low-res preview]
    end

    subgraph "Server"
        STREAM[Stream response]
        CACHE[Cache AI responses]
    end

    subgraph "AI"
        BATCH[Batch similar requests]
        WARM[Keep model warm]
    end
```
