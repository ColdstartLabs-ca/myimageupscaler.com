Here's a comprehensive picture of whether users are getting value from **myimageupscaler.com**, plus honest gaps in your current tracking:

---

## 📊 Are Users Getting Value?

**The core value signal is: upload → download.** Here's what the data shows:

### ✅ Upload-to-Download Conversion: ~59%
Out of 614 users who uploaded an image in the last 10 days (since tracking started Feb 27), **365 downloaded** — a 59% conversion rate. That's actually decent for a tool like this, but it means **~40% of uploaders never download**, which is a significant drop-off worth investigating.

[Upload → Download Funnel](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/new/xp55aq3e)

### ⚠️ Retention is Very Low
Of the 523 users who uploaded in the last 90 days, only **307 came back the next day** (59% Day 1), and by Day 7 that drops to just **2 users out of 267** (~0.7%). This tells you users are largely **one-and-done** — they come, upscale an image, and leave. This is common for utility tools, but it means your growth depends almost entirely on new user acquisition, not repeat usage.

[Retention Chart](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/new/zhbzcwdi)

### 🚨 Upgrade Funnel is Struggling
In the last 2 weeks, **596 unique users** saw an upgrade prompt, but only **46 clicked** (~7.7%) and **245 dismissed** (~41%). The batch limit modal is being shown to ~30 users/week, with only 5–9 clicking to upgrade. Users are hitting limits but not converting — the value proposition at the paywall moment may not be compelling enough.

[Upgrade Funnel](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/new/7dq68q19)

---

## 🔍 What's Missing from Your Tracking

Your current event taxonomy is lean but has meaningful gaps:

| Missing Event | Why It Matters |
|---|---|
| **`image_upscale_started` / `upscale_completed`** | You track upload & download, but not the actual upscaling step. If upscaling fails or is slow, you'd never know — users just silently drop off. |
| **`upscale_quality_selected`** (2x, 4x, etc.) | You have `model_selection_changed` but no property on *what* model/quality was chosen. You can't tell which settings drive downloads. |
| **`image_preview_viewed`** | Do users see the result before downloading? If they're not previewing, they may not realize the quality improvement. |
| **`checkout_started` / `checkout_completed`** | You have `checkout_abandoned` but no start or success event — you can't measure your actual payment conversion rate. |
| **`error_occurred`** (upscale failure, upload failure) | No error tracking means silent failures are invisible to you. |
| **`return_visit`** / user identity | You have `gp:subscription_tier` as a user property but no `user_id` being set for logged-in users, making it hard to track paid vs. free behavior. |
| **`image_download` properties** (file size, resolution, model used) | Downloads are tracked but without context — you can't tell if users who download 4x upscales are more satisfied than 2x. |

**The biggest gap:** You have no way to know *why* 40% of uploaders don't download. Is it a slow upscale? A bad result? A confusing UI? Adding an `upscale_completed` event with a `duration_ms` property and a `result_quality_rating` (if you show a preview) would unlock that answer immediately.

Would you like me to create a chart tracking the model gallery usage to see which upscale models are most popular?
