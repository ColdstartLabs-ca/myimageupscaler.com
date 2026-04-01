# AI Image Upscaling Models - Cost Analysis

**Last Updated:** March 2026
**Data Source:** Replicate API invoice (March 2026 actual billing)

---

## Production Stack (Replicate API)

### Active Model Catalog (March 2026)

Prices sourced from actual Replicate billing — unit costs per image (or per second for GPU-time-billed models).

| Model | Category | Billing Unit | Cost/Unit | Notes |
|-------|----------|-------------|-----------|-------|
| **nightmareai/real-esrgan** | Upscaling | per image | $0.0020 | Primary upscaler |
| **black-forest-labs/flux-schnell** | Generation | per image | $0.0030 | Fastest generation |
| **prunaai/p-image-edit** | Editing | per image | $0.0100 | Quick edits |
| **xinntao/gfpgan** | Face enhancement | per second (T4) | $0.000225 | ~$0.001-0.002/image |
| **prunaai/z-image-turbo** | Generation | per mp (output) | $0.0050 | Variable by resolution |
| **black-forest-labs/flux-dev** | Generation | per image | $0.0250 | Development quality |
| **qwen/qwen-image-edit-2511** | Editing | per image | $0.0300 | Advanced editing |
| **bytedance/seedream-4.5** | Generation | per image | $0.0400 | Mid-tier quality |
| **philz1337x/clarity-upscaler** | Upscaling | per second (A100) | $0.001150 | ~$0.012/image @2x, **~$0.12/image @4x** |
| **black-forest-labs/flux-2-pro** | Generation | per run + per mp | $0.015/run + $0.015/mp | Input + output mp billed |

### Model Categories

**Image Upscaling:** Real-ESRGAN ($0.002/img), Clarity Upscaler (~$0.012/img @2x, ~$0.12/img @4x)
**Face Enhancement:** GFPGAN (~$0.001-0.002/img)
**Image Editing:** P-Image-Edit ($0.010/img), Qwen Image Edit ($0.030/img)
**Image Generation:** Flux schnell ($0.003/img), Flux dev ($0.025/img), Flux 2 Pro (~$0.05+/img), Seedream ($0.040/img)

---

## March 2026 Actual Usage (from Invoice)

| Model | Total Cost | Volume | Effective Unit Cost |
|-------|-----------|--------|-------------------|
| nightmareai/real-esrgan | $8.36 | 4,181 images | $0.002/image |
| black-forest-labs/flux-2-pro | $2.42 | 72 runs, 11mp in, 78mp out | ~$0.034/run avg |
| qwen/qwen-image-edit-2511 | $1.05 | 35 images | $0.030/image |
| philz1337x/clarity-upscaler | $1.26 | 1,095 seconds (A100) | $0.001150/second |
| bytedance/seedream-4.5 | $0.32 | 8 images | $0.040/image |
| black-forest-labs/flux-dev | $0.38 | 15 images | $0.025/image |
| prunaai/z-image-turbo | $0.13 | 25 mp output | $0.005/mp |
| xinntao/gfpgan | $0.07 | 328 seconds (T4) | $0.000225/second |
| prunaai/p-image-edit | $0.02 | 2 images | $0.010/image |
| black-forest-labs/flux-schnell | $0.01 | 3 images | $0.003/image |
| **Subtotal** | **$14.01** | | |
| Credits applied | -$13.01 | | |
| **Net paid** | **$0.00** | | |

**Dominant cost driver:** Real-ESRGAN (4,181 images = 60% of gross spend at $8.36).

---

## Cost Comparison at Scale (Real-ESRGAN)

| Volume | Cost (@ $0.002/image) |
|--------|----------------------|
| 1,000 images | $2.00 |
| 10,000 images | $20.00 |
| 100,000 images | $200.00 |
| 1,000,000 images | $2,000.00 |

Real-ESRGAN remains cost-efficient at $0.002/image — consistent with December 2025 baseline ($0.0017).

---

## Unit Economics by Plan

### Starter Plan ($9/mo, 100 credits)

```
Revenue: $9.00
Cost (100% usage): 100 × $0.002 = $0.20
Gross Profit: $8.80
Margin: 97.8%
```

### Pro Plan ($29/mo, 500 credits)

```
Revenue: $29.00
Cost (100% usage): 500 × $0.002 = $1.00
Gross Profit: $28.00
Margin: 96.6%
```

### Business Plan ($99/mo, 2,500 credits)

```
Revenue: $99.00
Cost (100% usage): 2,500 × $0.002 = $5.00
Gross Profit: $94.00
Margin: 94.9%
```

**All plans remain highly profitable even at 100% utilization.**

---

## Model Capabilities

### Real-ESRGAN (nightmareai/real-esrgan)

| Feature | Value |
|---------|-------|
| Max Upscale | 4x |
| Input Formats | JPG, PNG, WebP |
| Max Input Size | 10MB |
| Output Quality | 8.5/10 |
| Consistency | 9.0/10 |
| Cost | $0.002/image |

### GFPGAN (xinntao/gfpgan)

| Feature | Value |
|---------|-------|
| Face Detection | Automatic |
| Enhancement Type | Restoration + upscale |
| Best For | Portraits, old photos |
| Quality | 9.0/10 on faces |
| Cost | $0.000225/second (~$0.001-0.002/image) |

### Clarity Upscaler (philz1337x/clarity-upscaler)

| Feature | Value |
|---------|-------|
| GPU | A100 (40GB) |
| Quality | 9.5/10 |
| Cost (2x) | $0.001150/second (~$0.012/image, ~11s GPU time) |
| Cost (4x) | $0.001150/second (~$0.12/image, ~104s GPU time) |
| Credits (2x) | 4 credits |
| Credits (4x) | 8 credits (2.0x scale multiplier) |
| Use Case | Premium tier — higher quality, higher cost than Real-ESRGAN |

### Flux Family (black-forest-labs)

| Model | Cost | Quality | Use Case |
|-------|------|---------|----------|
| flux-schnell | $0.003/image | 8/10 | Fast, cheap generation |
| flux-dev | $0.025/image | 9/10 | Development |
| flux-2-pro | $0.015/run + $0.015/mp | 9.5/10 | Production generation |

---

## GPU Selection Strategy

| Scenario | Model | Cost | Credits | Speed |
|----------|-------|------|---------|-------|
| Standard upscaling (2x/4x) | Real-ESRGAN (T4) | $0.002/img | 1 CR | ~1.8s |
| Portrait enhancement | GFPGAN (T4) | ~$0.002/img | 2 CR | ~5-10s |
| Premium upscaling (2x) | Clarity Upscaler (A100) | ~$0.012/img | 4 CR | ~11s |
| Premium upscaling (4x) | Clarity Upscaler (A100) | ~$0.12/img | 8 CR | ~104s |

---

## Cost Optimization Strategies

### 1. Smart Model Routing

```
if (user.plan === 'free' || user.plan === 'starter') {
  model = 'real-esrgan'  // $0.002/image — best value
} else if (user.needsFaceEnhancement) {
  model = 'gfpgan'  // ~$0.002/image — face-optimized
} else if (user.plan === 'business' && premiumQuality) {
  model = 'clarity-upscaler'  // ~$0.017-0.035/image — higher quality
}
```

### 2. Batch Efficiency

- Process multiple images in single API call where possible
- Queue management to optimize GPU utilization
- Retry failed jobs without user credit deduction

### 3. Caching

- Cache identical image results (hash-based)
- Estimated savings: 20-30% on repeat uploads

---

## Competitive Cost Comparison (March 2026)

| Provider | Cost/Image | Our Real-ESRGAN | Our Clarity Upscaler |
|----------|------------|-----------------|---------------------|
| Topaz API | $0.10-0.20 | $0.002 (50-100x cheaper) | $0.017-0.035 (3-12x cheaper) |
| Let's Enhance | $0.07-0.09 | $0.002 (35-45x cheaper) | $0.017-0.035 (2-5x cheaper) |
| Magnific AI | $0.15-0.40 | $0.002 (75-200x cheaper) | $0.017-0.035 (4-24x cheaper) |

**Cost structure enables:** Aggressive pricing ($9/mo entry), generous free tier (10 images), 95%+ gross margins, room for future premium features.

---

## Scaling Considerations

### Current Strategy (0-100k images/month)
- Use Replicate API — pay-per-use, no minimum
- Real-ESRGAN at $0.002/image is highly cost-efficient
- Infrastructure cost: ~$200/month at 100k images

### Future Strategy (100k+ images/month)
- Evaluate self-hosting Real-ESRGAN
- Dedicated GPU instance: ~$500-1,000/month
- Break-even vs Replicate: ~250k-500k images/month
- Consider at: $30k+ MRR

---

*See also: [Pricing Proposal](./pricing-proposal-v2.md), [Regional Dynamic Pricing](../../PRDs/regional-dynamic-pricing.md)*
