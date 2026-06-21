import { z } from 'zod';

export const SEO_EQUITY_SURFACES = [
  'homepageBlogPicks',
  'blogIndexFeatured',
  'blogStartHere',
  'blogFooterRelated',
  'pseoRelatedBlogPosts',
  'hubSpokeLinks',
] as const;

export const SEO_EQUITY_ENTITY_TYPES = ['blog', 'tool', 'pseo', 'hub'] as const;

const relativeUrlSchema = z.string().regex(/^\/[a-z0-9][a-z0-9\-/_]*$/i, 'Must be a site-relative URL');
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const surfaceSchema = z.enum(SEO_EQUITY_SURFACES);

export const seoEquityConfigSchema = z
  .object({
    version: z.literal(1),
    siteUrl: z.string().url(),
    settings: z.object({
      refreshCadence: z.enum(['weekly', 'monthly', 'weekly-or-monthly']),
      minStableDaysAfterEdit: z.number().int().min(0),
      minMaterialScoreDelta: z.number().min(0),
    }),
    maxSurfaceSlots: z.object({
      homepageBlogPicks: z.number().int().min(0).max(20),
      blogIndexFeatured: z.number().int().min(0).max(20),
      blogStartHere: z.number().int().min(0).max(20),
      blogFooterRelated: z.number().int().min(0).max(20),
      pseoRelatedBlogPosts: z.number().int().min(0).max(20),
      hubSpokeLinks: z.number().int().min(0).max(20),
    }),
    allowlist: z.array(relativeUrlSchema).default([]),
    blocklist: z.array(relativeUrlSchema).default([]),
    pinnedBySurface: z.record(surfaceSchema, z.array(relativeUrlSchema)).default({}),
    canonicalClusters: z.array(
      z.object({
        id: z.string().min(1),
        intent: z.string().min(1),
        members: z
          .array(
            z.object({
              url: relativeUrlSchema,
              winner: z.boolean(),
            })
          )
          .min(1),
      })
    ),
    businessValueWeights: z.record(relativeUrlSchema, z.number().min(0).max(5)).default({}),
    recentlyEditedUntil: z.record(relativeUrlSchema, isoDateSchema).default({}),
    localePolicy: z.object({
      default: z.enum(['english-only', 'localized-safe', 'localized-only']),
      overrides: z.record(relativeUrlSchema, z.enum(['english-only', 'localized-safe', 'localized-only'])).default({}),
    }),
    pseoRelatedTargets: z.record(relativeUrlSchema, z.array(relativeUrlSchema)).default({}),
  })
  .superRefine((config, ctx) => {
    for (const cluster of config.canonicalClusters) {
      const winnerCount = cluster.members.filter(member => member.winner).length;
      if (winnerCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['canonicalClusters', cluster.id],
          message: `Canonical cluster "${cluster.id}" must have exactly one winner`,
        });
      }
    }
  });

export const seoEquityScoreBreakdownSchema = z.object({
  impressions: z.number(),
  position: z.number(),
  ctrGap: z.number(),
  businessValue: z.number(),
  freshness: z.number(),
  cannibalization: z.number(),
  conversion: z.number(),
});

export const seoEquityEntitySchema = z.object({
  url: relativeUrlSchema,
  type: z.enum(SEO_EQUITY_ENTITY_TYPES),
  canonicalCluster: z.string().optional(),
  canonicalWinner: z.boolean(),
  score: z.number(),
  scoreBreakdown: seoEquityScoreBreakdownSchema,
  eligibleSurfaces: z.array(surfaceSchema),
  guardrails: z.array(z.string()),
});

export const seoEquitySnapshotSchema = z.object({
  generatedAt: z.string().datetime(),
  source: z.object({
    gscExport: z.string(),
    window: z.object({
      startDate: isoDateSchema,
      endDate: isoDateSchema,
      days: z.number().int().positive(),
    }),
  }),
  settings: z.object({
    refreshCadence: z.enum(['weekly', 'monthly', 'weekly-or-monthly']),
    minStableDaysAfterEdit: z.number().int().min(0),
    minMaterialScoreDelta: z.number().min(0),
  }),
  entities: z.array(seoEquityEntitySchema),
  surfaces: z.object({
    homepageBlogPicks: z.array(relativeUrlSchema),
    blogIndexFeatured: z.array(relativeUrlSchema),
    blogStartHere: z.array(
      z.object({ label: z.string(), href: relativeUrlSchema, description: z.string() })
    ),
    blogFooterRelated: z.record(relativeUrlSchema, z.array(relativeUrlSchema)),
    pseoRelatedBlogPosts: z.record(relativeUrlSchema, z.array(relativeUrlSchema)),
    hubSpokeLinks: z.record(relativeUrlSchema, z.array(relativeUrlSchema)),
  }),
});

export const seoEquityGscPageSchema = z.object({
  url: z.string(),
  clicks: z.number().default(0),
  impressions: z.number().default(0),
  ctr: z.number().default(0),
  position: z.number().default(100),
});

export type ISeoEquitySurface = (typeof SEO_EQUITY_SURFACES)[number];
export type ISeoEquityConfig = z.infer<typeof seoEquityConfigSchema>;
export type ISeoEquitySnapshot = z.infer<typeof seoEquitySnapshotSchema>;
export type ISeoEquityEntity = z.infer<typeof seoEquityEntitySchema>;
export type ISeoEquityGscPage = z.infer<typeof seoEquityGscPageSchema>;
