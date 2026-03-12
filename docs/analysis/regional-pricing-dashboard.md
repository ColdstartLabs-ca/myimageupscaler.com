# Regional Pricing Analysis Dashboard

## Overview

This dashboard analyzes conversion rates by pricing region to validate PPP-adjusted (Purchasing Power Parity) discounts. The goal is to understand whether regional pricing increases conversions in target markets without cannibalizing revenue from standard-tier regions.

## Implementation Status

- **User Property**: `pricing_region` is set via `$identify` with `$setOnce` (client-side on first geo load, server-side on checkout)
- **Event Properties**: All pricing-related events include `pricing_region` for redundancy
- **Regions**: `standard`, `south_asia`, `southeast_asia`, `latam`, `eastern_europe`, `africa`

## Charts

### 1. Conversion Funnel by Region

- **Type**: Funnel chart
- **Steps**:
  1. `pricing_page_viewed` (with `pricing_region` property)
  2. `checkout_started` (with `pricing_region` property)
  3. `checkout_completed` (with `pricing_region` property)
- **Segmentation**: `pricing_region`
- **Purpose**: Compare conversion rates across regions to validate PPP discounts
- **Expected Insight**: Higher conversion rates in discounted regions (south_asia, southeast_asia, latam) relative to standard

### 2. ARPU by Region

- **Type**: Bar chart
- **Metric**: Average Revenue Per User (from `revenue_received` events)
- **Segmentation**: `pricing_region` user property
- **Purpose**: Compare revenue efficiency across regions
- **Expected Insight**: Lower ARPU in discounted regions is acceptable if conversion volume compensates

### 3. Regional Conversion Rate Over Time

- **Type**: Line chart
- **Metric**: Conversion rate (%) = `checkout_completed` / `pricing_page_viewed`
- **Segmentation**: `pricing_region`
- **Time**: Last 30 days, daily granularity
- **Purpose**: Track trends and identify anomalies
- **Expected Insight**: Stable or improving conversion rates after regional pricing launch

### 4. Discount Sensitivity Analysis

- **Type**: Scatter plot
- **X-axis**: Discount percentage (0%, 40%, 50%, 60%, 65%)
- **Y-axis**: Conversion rate
- **Purpose**: Correlate discount level with conversion rate
- **Expected Insight**: Positive correlation between discount depth and conversion rate

## Amplitude Queries

### Funnel Analysis Query

```
Funnel: pricing_page_viewed -> checkout_started -> checkout_completed
Segment by: user_properties.pricing_region
Time range: Last 30 days
```

### ARPU by Region Query

```
Metric: Average Revenue Per User (ARPU)
Segment by: user_properties.pricing_region
Revenue property: $revenue
Time range: Last 30 days
```

### Conversion Rate Over Time Query

```
Formula: (checkout_completed / pricing_page_viewed) * 100
Segment by: user_properties.pricing_region
Time range: Last 30 days
Interval: Daily
```

## Alerts

### Conversion Rate Deviation Alert

- **Trigger**: Any region's conversion rate deviates >20% from its 7-day rolling average
- **Channels**: Email, Slack (#pricing-alerts)
- **Frequency**: Daily check at 9 AM UTC
- **Action**: Investigate potential issues (payment gateway, pricing display, regional targeting)

### Region Coverage Alert

- **Trigger**: `pricing_region` property coverage on `pricing_page_viewed` events drops below 95%
- **Channels**: Email (engineering team)
- **Frequency**: Daily check
- **Action**: Debug geo detection or analytics instrumentation

### High-Value Region Anomaly Alert

- **Trigger**: Conversion rate in `standard` region drops >15% week-over-week
- **Channels**: Email, Slack (#pricing-alerts)
- **Frequency**: Weekly check (Monday 9 AM UTC)
- **Action**: Check for accidental discount application, UI bugs, or competitor pricing changes

## User Segments

Create the following user segments in Amplitude for easy analysis:

| Segment Name                   | Definition                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Pricing Region: Standard       | `user_properties.pricing_region = "standard"`                                                             |
| Pricing Region: South Asia     | `user_properties.pricing_region = "south_asia"`                                                           |
| Pricing Region: Southeast Asia | `user_properties.pricing_region = "southeast_asia"`                                                       |
| Pricing Region: LatAm          | `user_properties.pricing_region = "latam"`                                                                |
| Pricing Region: Eastern Europe | `user_properties.pricing_region = "eastern_europe"`                                                       |
| Pricing Region: Africa         | `user_properties.pricing_region = "africa"`                                                               |
| Discounted Regions             | `user_properties.pricing_region IN ["south_asia", "southeast_asia", "latam", "eastern_europe", "africa"]` |

## Key Metrics to Track

| Metric                        | Formula                                         | Target           |
| ----------------------------- | ----------------------------------------------- | ---------------- |
| Overall Conversion Rate       | `checkout_completed / pricing_page_viewed`      | >3%              |
| Standard Region ARPU          | Revenue / Users (standard region)               | >$8/month        |
| South Asia Conversion Lift    | `(south_asia CVR / standard CVR) - 1`           | >50% improvement |
| Discount Region Revenue Share | Revenue from discounted regions / Total revenue | 10-20%           |
| Property Coverage             | Events with `pricing_region` / Total events     | >95%             |

## Dashboard Refresh Schedule

- **Real-time**: Conversion funnel (hourly refresh)
- **Daily**: ARPU by region, conversion rate over time (refresh at 6 AM UTC)
- **Weekly**: Discount sensitivity analysis (refresh Monday 6 AM UTC)

## Related Documentation

- PRD: `docs/PRDs/regional-dynamic-pricing.md`
- Region Classifier: `lib/anti-freeloader/region-classifier.ts`
- Pricing Regions Config: `shared/config/pricing-regions.ts`
- Analytics Service: `server/analytics/analyticsService.ts`
