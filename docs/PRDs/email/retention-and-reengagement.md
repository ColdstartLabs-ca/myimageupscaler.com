# Retention & Re-engagement — Fix the Leaky Bucket

## Context

Day-1 retention is **1.2%** (industry baseline: 20-30%). 98.8% of users never come back. Session length is healthy (2-3.5 min) and activation is decent (23% download rate), which means the product works — people just have no reason or mechanism to return.

**Dependency:** PRD 1 (Analytics Instrumentation V2) should ship first or in parallel. Amplitude identity resolution is foundational for measuring whether these changes actually improve retention.

## Problem Statement

Users arrive, upscale an image, and leave forever. There is:

1. No persistent identity — anonymous users can't be recognized on return
2. No re-engagement channel — no way to bring users back
3. No history — returning users start from scratch every time
4. No reason to return — the tool solves a one-time need with no hook for repeated use

## Goals

1. Increase Day-1 retention from 1.2% to 10%+ within 8 weeks
2. Create at least one re-engagement channel (email)
3. Give users a reason to return (history, saved preferences)
4. Build the foundation for a growth loop (share → new users → share)

## Non-Goals

- Full user account system with profiles/settings (too heavy for now)
- Push notifications (low adoption, high friction)
- Gamification or rewards programs
- Social features

## Proposed Solution

Three layers, shipping incrementally:

### Layer 1: Persistent Anonymous State (No Account Required)

**Goal:** Recognize returning users and make them feel at home.

#### 1A. Local Processing History

Store recent upscales in localStorage so returning users see "Your recent upscales" on the homepage.

**Implementation:**

```typescript
interface IUpscaleHistoryEntry {
  id: string; // uuid
  thumbnailDataUrl: string; // base64 thumbnail (max 100x100px, ~5KB)
  originalFilename: string;
  qualityTier: string;
  scaleFactor: number;
  outputDimensions: { width: number; height: number };
  createdAt: string; // ISO timestamp
}
```

- Store last 20 entries in localStorage (key: `miu_upscale_history`)
- Show a "Recent Upscales" section on the main page when history exists
- Each entry shows: thumbnail, filename, tier used, dimensions, date
- "Try again" button to re-upload a similar image
- "Clear history" option for privacy
- Total localStorage budget: ~100KB (20 entries × 5KB thumbnail)

**Files to modify:**

- New: `client/hooks/useUpscaleHistory.ts`
- New: `client/components/features/workspace/RecentUpscales.tsx`
- Modify: Main upscaler page to conditionally show recent upscales
- Modify: Download flow to save entry to history

#### 1B. Saved Preferences

Remember the user's last-used settings:

```typescript
interface ISavedPreferences {
  qualityTier: QualityTier;
  scaleFactor: number;
  smartAnalysis: boolean;
}
```

- Store in localStorage (key: `miu_preferences`)
- Apply on page load instead of defaults
- Subtle "Welcome back" indicator when preferences are restored

### Layer 2: Optional Email Capture (Lightweight)

**Goal:** Create a re-engagement channel without requiring account creation.

#### 2A. Post-Download Email Capture

After a successful download, show a **non-blocking** prompt:

```
[Your image is ready!]

Get notified when we add new AI models and features.
[email input] [Subscribe]

No spam. Unsubscribe anytime.
```

**Rules:**

- Only show once per session (sessionStorage flag)
- Only show after successful download (earned moment)
- Dismiss permanently if user closes it (localStorage flag)
- If user already has an account, skip entirely
- GDPR: explicit opt-in, no pre-checked boxes

**Implementation:**

- New: `client/components/features/workspace/PostDownloadEmailCapture.tsx`
- Store email in Supabase `email_subscribers` table (or use existing email service)
- Track: `email_capture_shown`, `email_captured`, `email_capture_dismissed`

#### 2B. Weekly Digest Email (Future, after enough subscribers)

Once we have >100 subscribers, send a weekly email:

- "You upscaled X images this week" (if tracked)
- New model/feature announcements
- "Your credits are expiring" (for paid users)
- One-click link back to the tool

This is out of scope for initial implementation but should influence email capture design.

### Layer 3: Activation Improvements

**Goal:** Convert more of the 77% who visit but never upload.

#### 3A. Sample Images for First-Time Visitors

Show 2-3 sample images that users can click to try the upscaler immediately:

```
[Try it now — click a sample image]
[Photo] [Illustration] [Old Photo]
```

- Only show to users with no upload history
- Each sample demonstrates a different quality tier
- After processing, show before/after comparison
- This reduces the "what file should I use?" friction

**Files to modify:**

- New: `client/components/features/workspace/SampleImages.tsx`
- Store 3 optimized sample images in `public/samples/` (~50KB each)
- Track: `sample_image_selected` with `sampleType` property

#### 3B. Before/After Comparison on Download

After processing, show a before/after slider comparison:

- Side-by-side or slider comparison of original vs. upscaled
- "Share result" button (generates a comparison image or link)
- "Upscale another image" CTA prominently placed

The share mechanic creates a lightweight growth loop:
User shares comparison → viewer clicks → viewer tries the tool → viewer shares

**Files to modify:**

- New: `client/components/features/workspace/BeforeAfterComparison.tsx`
- Modify: Result/download view to include comparison
- Track: `comparison_viewed`, `result_shared`

## Analytics Events (New)

All events should be added to the event whitelist and type definitions.

| Event                      | Properties                     | Location                 |
| -------------------------- | ------------------------------ | ------------------------ |
| `history_entry_viewed`     | `entryId`, `ageHours`          | RecentUpscales           |
| `history_reupload_clicked` | `entryId`, `qualityTier`       | RecentUpscales           |
| `preferences_restored`     | `qualityTier`, `scaleFactor`   | useUpscaleHistory        |
| `email_capture_shown`      | `trigger` (post_download)      | PostDownloadEmailCapture |
| `email_captured`           | `trigger`                      | PostDownloadEmailCapture |
| `email_capture_dismissed`  | `trigger`                      | PostDownloadEmailCapture |
| `sample_image_selected`    | `sampleType`                   | SampleImages             |
| `comparison_viewed`        | `qualityTier`, `scaleFactor`   | BeforeAfterComparison    |
| `result_shared`            | `shareMethod` (link, download) | BeforeAfterComparison    |

## Implementation Priority

| Phase | What                              | Effort   | Expected Impact                               |
| ----- | --------------------------------- | -------- | --------------------------------------------- |
| **1** | Local history + saved preferences | 2-3 days | Recognize return users, +3-5% Day-1 retention |
| **2** | Sample images for first visitors  | 1-2 days | Improve activation from 23% → 35%+            |
| **3** | Post-download email capture       | 1-2 days | Build re-engagement channel                   |
| **4** | Before/after comparison + share   | 2-3 days | Growth loop foundation                        |

## Validation Criteria

### Metrics to Track (via Amplitude, enabled by PRD 1)

- Day-1, Day-7, Day-30 retention (requires identity resolution from PRD 1)
- Return visit rate: % of device_ids with >1 session
- History engagement: % of returning users who interact with history
- Email capture rate: `email_captured` / `email_capture_shown`
- Activation rate: `image_uploaded` / `page_view` (before/after sample images)
- Share rate: `result_shared` / `image_download`

### Success Criteria

- Day-1 retention > 5% within 4 weeks of Layer 1 launch
- Day-1 retention > 10% within 4 weeks of Layer 2 launch
- Email capture rate > 5%
- Activation improvement: 23% → 30%+ download rate

## Testing

- Unit tests for `useUpscaleHistory` hook (add, retrieve, clear, max limit)
- Unit tests for localStorage preference restoration
- E2E test: upload → download → verify history entry appears on reload
- E2E test: email capture shows after download, dismisses permanently
- E2E test: sample image click → processing → result shown

## Risks

- **localStorage limits**: 5-10MB depending on browser. 100KB for history is safe.
- **Privacy concerns**: Storing thumbnails locally could be sensitive for some users. "Clear history" must be prominent.
- **Email deliverability**: Need proper email infrastructure (already exists via email service).
- **Sample images copyright**: Use our own generated samples or royalty-free images.
