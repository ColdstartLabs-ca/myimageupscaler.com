# Credit System

Credit-based usage tracking and management.

## Overview

PixelPerfect uses a credit system to manage image processing quotas. Each action costs a specific number of credits based on the processing mode and options selected.

```mermaid
graph TD
    subgraph "Credit Sources"
        SIGNUP[Free Signup: 10 credits]
        SUB[Subscription: Monthly]
        PURCHASE[One-time Purchase]
        REFUND[Processing Refund]
    end

    subgraph "Credit Pool"
        BALANCE[(credits_balance)]
    end

    subgraph "Credit Usage"
        PROCESS[Image Processing]
    end

    SIGNUP --> BALANCE
    SUB --> BALANCE
    PURCHASE --> BALANCE
    REFUND --> BALANCE

    BALANCE --> PROCESS
```

## Credit Costs

| Action            | Mode    | Cost           |
| ----------------- | ------- | -------------- |
| Image Upscaling   | upscale | 1 credit       |
| Image Enhancement | enhance | 2 credits      |
| Upscale + Enhance | both    | 2 credits      |
| Custom Processing | custom  | 2 credits      |
| Batch Processing  | any     | per-image cost |

## Credit Allocation by Tier

| Tier     | Monthly Credits | Max Rollover | Price  |
| -------- | --------------- | ------------ | ------ |
| Free     | 10 (one-time)   | -            | $0     |
| Starter  | 100             | 600          | $9/mo  |
| Pro      | 500             | 3,000        | $29/mo |
| Business | 2,500           | 15,000       | $99/mo |

## Credit Flow

### Deduction Flow

```mermaid
sequenceDiagram
    participant API
    participant DB
    participant User

    API->>DB: SELECT credits_balance WHERE id = user_id
    DB-->>API: { credits_balance: 50 }

    API->>API: Check: 50 >= 1 (required)?

    alt Sufficient Credits
        API->>DB: UPDATE credits_balance = 49
        API->>DB: INSERT credit_transaction
        API->>API: Process image
        API-->>User: Success
    end

    alt Insufficient Credits
        API-->>User: 402 Payment Required
    end
```

### Refund Flow

```mermaid
flowchart TD
    FAIL[Processing Failed] --> TYPE{Failure Type}

    TYPE -->|AI Error| REFUND[Automatic Refund]
    TYPE -->|User Cancel| NO_REFUND[No Refund]
    TYPE -->|Timeout| REFUND

    REFUND --> ADD[Add Credits Back]
    ADD --> LOG[Log Transaction]
    LOG --> NOTIFY[Notify User]
```

## Database Operations

### Check Balance

```typescript
async function getCreditsBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data.credits_balance;
}
```

### Deduct Credits (Atomic)

```typescript
async function deductCredits(userId: string, amount: number, description: string): Promise<void> {
  // Use RPC for atomic operation
  const { error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
  });

  if (error) {
    if (error.message.includes('insufficient')) {
      throw new Error('INSUFFICIENT_CREDITS');
    }
    throw error;
  }
}
```

### Database Function

```sql
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT
) RETURNS void AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Lock row and get current balance
  SELECT credits_balance INTO current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF current_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient credits';
  END IF;

  -- Deduct credits
  UPDATE profiles
  SET credits_balance = credits_balance - p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Log transaction
  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, -p_amount, 'usage', p_description);
END;
$$ LANGUAGE plpgsql;
```

### Add Credits

```typescript
async function addCredits(
  userId: string,
  amount: number,
  type: 'subscription' | 'purchase' | 'refund' | 'bonus',
  referenceId?: string
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_balance, subscription_tier')
    .eq('id', userId)
    .single();

  // Calculate max rollover based on tier
  const maxRollover = getMaxRollover(profile.subscription_tier);
  const newBalance = Math.min(profile.credits_balance + amount, maxRollover);

  await supabase.from('profiles').update({ credits_balance: newBalance }).eq('id', userId);

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: amount,
    type: type,
    reference_id: referenceId,
    description: `${type} - ${amount} credits`,
  });
}
```

## Rollover Logic

```mermaid
flowchart TD
    RENEW[Subscription Renewal] --> GET[Get Current Balance]
    GET --> CALC{Calculate New Balance}

    CALC --> CHECK{Current + Monthly > Max?}

    CHECK -->|Yes| CAP[Cap at Max Rollover]
    CHECK -->|No| ADD[Add Full Amount]

    CAP --> UPDATE[Update Balance]
    ADD --> UPDATE
```

### Rollover Calculation

```typescript
function calculateNewBalance(currentBalance: number, monthlyCredits: number, tier: string): number {
  const maxRollover: Record<string, number> = {
    starter: 600, // 6x monthly
    pro: 3000, // 6x monthly
    business: 15000, // 6x monthly
  };

  const max = maxRollover[tier] || monthlyCredits;
  return Math.min(currentBalance + monthlyCredits, max);
}
```

## Transaction Types

| Type           | Description         | Amount   |
| -------------- | ------------------- | -------- |
| `usage`        | Image processing    | Negative |
| `subscription` | Monthly renewal     | Positive |
| `purchase`     | One-time purchase   | Positive |
| `refund`       | Processing failure  | Positive |
| `bonus`        | Promotional credits | Positive |

## Transaction Log Schema

```sql
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    amount INTEGER NOT NULL,          -- Positive or negative
    type TEXT NOT NULL,               -- usage, subscription, purchase, refund, bonus
    reference_id TEXT,                -- Job ID, Stripe ID, etc.
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_type CHECK (
      type IN ('usage', 'subscription', 'purchase', 'refund', 'bonus')
    )
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
```

## API Endpoints

### GET /api/credits

Returns credit balance and recent transactions.

```json
{
  "success": true,
  "data": {
    "balance": 85,
    "monthlyAllowance": 500,
    "usedThisMonth": 15,
    "maxRollover": 3000,
    "tier": "pro",
    "recentTransactions": [
      {
        "id": "uuid",
        "amount": -1,
        "type": "usage",
        "description": "Image processing",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

## Usage Analytics

```mermaid
graph LR
    subgraph "Metrics"
        DAILY[Daily Usage]
        WEEKLY[Weekly Trend]
        MONTHLY[Monthly Total]
    end

    subgraph "Alerts"
        LOW[Low Balance Warning]
        EMPTY[Credits Exhausted]
        SPIKE[Usage Spike]
    end

    DAILY --> LOW
    MONTHLY --> EMPTY
    DAILY --> SPIKE
```

### Low Balance Warning

```typescript
// Trigger when balance falls below 20% of monthly
function shouldWarnLowBalance(balance: number, monthlyAllowance: number): boolean {
  return balance < monthlyAllowance * 0.2;
}
```
