# AI Image Upscaling Models - Cost Analysis

**Last Updated:** December 2025
**Standard Model:** Real-ESRGAN via Replicate

---

## Production Stack (Replicate API)

### Primary Models

| Model | Cost/Run | Speed | Use Case | Quality |
|-------|----------|-------|----------|---------|
| **Real-ESRGAN (T4)** | $0.0017 | ~1.8s | Standard processing | 8.5/10 |
| **Real-ESRGAN (A100)** | $0.0026 | ~0.7s | Priority/fast queue | 8.5/10 |
| **Real-ESRGAN + GFPGAN** | $0.0025 | ~2s | Portrait enhancement | 9.0/10 |

### Why Real-ESRGAN?

1. **Cost efficiency:** $0.0017/image = 588 images per $1
2. **Speed:** Sub-2-second processing on standard GPU
3. **Quality:** Production-proven, consistent results
4. **Reliability:** Stable model, predictable output
5. **Flexibility:** T4 for budget, A100 for speed

---

## Cost Comparison at Scale

| Volume | Real-ESRGAN (T4) | Real-ESRGAN (A100) | With GFPGAN |
|--------|------------------|--------------------| ------------|
| 100 images | $0.17 | $0.26 | $0.25 |
| 1,000 images | $1.70 | $2.60 | $2.50 |
| 10,000 images | $17.00 | $26.00 | $25.00 |
| 100,000 images | $170.00 | $260.00 | $250.00 |

---

## Unit Economics by Plan

### Starter Plan ($9/mo, 100 credits)

```
Revenue: $9.00
Cost (100% usage): 100 × $0.0017 = $0.17
Gross Profit: $8.83
Margin: 98.1%
```

### Pro Plan ($29/mo, 500 credits)

```
Revenue: $29.00
Cost (100% usage): 500 × $0.0017 = $0.85
Gross Profit: $28.15
Margin: 97.1%
```

### Business Plan ($99/mo, 2,500 credits)

```
Revenue: $99.00
Cost (100% usage): 2,500 × $0.0017 = $4.25
Gross Profit: $94.75
Margin: 95.7%
```

**All plans remain highly profitable even at 100% utilization.**

---

## GPU Selection Strategy

| Scenario | Recommended GPU | Cost | Speed |
|----------|-----------------|------|-------|
| Free tier | T4 | $0.0017 | ~1.8s |
| Starter tier | T4 | $0.0017 | ~1.8s |
| Pro tier | T4 (A100 optional) | $0.0017-0.0026 | 0.7-1.8s |
| Business tier | A100 priority | $0.0026 | ~0.7s |
| Portrait mode | T4 + GFPGAN | $0.0025 | ~2s |

---

## Model Capabilities

### Real-ESRGAN

| Feature | Support |
|---------|---------|
| Max Upscale | 4x |
| Input Formats | JPG, PNG, WebP |
| Max Input Size | 10MB |
| Output Quality | 8.5/10 |
| Consistency | 9.0/10 |
| Text Handling | Fair (needs OCR mode) |

### GFPGAN (Face Enhancement Add-on)

| Feature | Support |
|---------|---------|
| Face Detection | Automatic |
| Enhancement Type | Restoration + upscale |
| Best For | Portraits, old photos |
| Quality | 9.0/10 on faces |
| Limitation | Only enhances faces |

---

## Alternative Models (Reference Only)

For premium/specialized use cases, these models are available but **not recommended for standard operations:**

| Model | Cost/Run | Quality | Use Case |
|-------|----------|---------|----------|
| Clarity Upscaler | $0.017 | 9.5/10 | Premium tier (future) |
| Nano Banana Pro | $0.13 | 9.8/10 | Heavy restoration (future) |
| SUPIR | $0.40 | 9.0/10 | Not recommended |

**Decision:** Real-ESRGAN provides the best value for 95%+ of use cases. Consider premium models only for a future "HD Quality" tier.

---

## Cost Optimization Strategies

### 1. Smart GPU Routing

```
if (user.plan === 'free' || user.plan === 'starter') {
  gpu = 'T4'  // $0.0017
} else if (user.plan === 'business' || user.priorityQueue) {
  gpu = 'A100'  // $0.0026
} else {
  gpu = 'T4'  // default
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

## Competitive Cost Advantage

| Provider | Cost/Image | Our Cost | Advantage |
|----------|------------|----------|-----------|
| Topaz API | $0.10-0.20 | $0.0017 | **59-117x cheaper** |
| Let's Enhance | $0.07-0.09 | $0.0017 | **41-53x cheaper** |
| Magnific AI | $0.15-0.40 | $0.0017 | **88-235x cheaper** |

**This cost structure enables:**
- Aggressive pricing ($9/mo entry)
- Generous free tier (10 images)
- 95%+ gross margins
- Room for future premium features

---

## Scaling Considerations

### Current Strategy (0-100k images/month)
- Use Replicate API
- Pay-per-use, no minimum
- Infrastructure cost: $17-170/month

### Future Strategy (100k+ images/month)
- Evaluate self-hosting Real-ESRGAN
- Dedicated GPU instance: ~$500-1,000/month
- Break-even: ~300k images/month
- Consider at: $30k+ MRR

---

*See also: [Pricing Proposal](./pricing-proposal-v2.md), [Competitor Analysis](../competitor/competitor-analysis-summary.md)*
