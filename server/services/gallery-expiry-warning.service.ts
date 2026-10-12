import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';

/**
 * PRD-SQR-04 Phase 2 — gallery expiry warning eligibility and dedup.
 *
 * This service only reads candidates and enqueues warnings. It never deletes
 * queue rows, notice rows, or storage objects. Delivery proof lives on
 * `gallery_expiry_notices.warning_sent_at`, which a DB trigger copies from the
 * queue, so pruning the queue cannot lose it.
 */

export const GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY = 'gallery_expiry_warning' as const;
export const GALLERY_EXPIRY_CTA_DESTINATION = '/dashboard/gallery' as const;
/** Inactivity threshold enforced by the candidate RPC. Kept here for callers and tests. */
export const GALLERY_EXPIRY_WARNING_INACTIVITY_DAYS = 23;
const GALLERY_EXPIRY_CANDIDATE_MAX = 50;
const GALLERY_EXPIRY_CANDIDATE_MIN = 1;

export interface IGalleryExpiryWarningCandidate {
  user_id: string;
  activity_anchor: string;
}

export interface IQueueGalleryExpiryWarningsOptions {
  limit?: number;
}

export interface IQueueGalleryExpiryWarningsResult {
  /** Candidates returned by the eligibility RPC for this run. */
  scanned: number;
  /** New pending warnings created this run. */
  warned: number;
  /** Lost-response recoveries: an existing pending warning was re-linked. */
  recovered: number;
  /** Candidates that could not be queued or recovered. */
  failed: number;
  /** Candidates already carrying real delivery proof for the current period. */
  alreadyDelivered: number;
}

interface INoticeRow {
  id: string;
  queue_id: string | null;
  warning_sent_at: string | null;
}

interface IQueueRow {
  id: string;
  campaign_key: string;
  user_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
}

/**
 * Validate a raw PostgREST timestamptz string without changing it. A JS Date
 * round-trip truncates PostgreSQL microseconds and would starve the SQL notice
 * match, so the exact stored text must survive end to end.
 */
function isValidAnchorRaw(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return GALLERY_EXPIRY_CANDIDATE_MAX;
  return Math.min(Math.max(Math.trunc(limit as number), GALLERY_EXPIRY_CANDIDATE_MIN), GALLERY_EXPIRY_CANDIDATE_MAX);
}

async function loadCandidatePage(limit: number): Promise<IGalleryExpiryWarningCandidate[]> {
  const { data, error } = await supabaseAdmin.rpc('get_gallery_expiry_warning_candidates', {
    p_limit: limit,
  });
  if (error) {
    throw new Error(`Failed to load gallery expiry warning candidates: ${error.message}`);
  }
  return (data ?? []) as IGalleryExpiryWarningCandidate[];
}

async function cancelStaleWarnings(): Promise<void> {
  const { error } = await supabaseAdmin.rpc('cancel_stale_gallery_expiry_warnings');
  if (error) {
    throw new Error(`Failed to cancel stale gallery expiry warnings: ${error.message}`);
  }
}

async function findNotice(userId: string, anchorIso: string): Promise<INoticeRow | null> {
  const { data, error } = await supabaseAdmin
    .from('gallery_expiry_notices')
    .select('id, queue_id, warning_sent_at')
    .eq('user_id', userId)
    .eq('activity_anchor', anchorIso)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load gallery expiry notice: ${error.message}`);
  }
  return (data as INoticeRow | null) ?? null;
}

async function insertNotice(userId: string, anchorIso: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('gallery_expiry_notices')
    .insert({ user_id: userId, activity_anchor: anchorIso })
    .select('id')
    .single();

  if (!error && data?.id) return String(data.id);

  // A concurrent run may have inserted the same (user, anchor) first.
  if (error?.code === '23505') {
    const existing = await findNotice(userId, anchorIso);
    if (existing) return existing.id;
  }
  throw new Error(`Failed to insert gallery expiry notice: ${error?.message ?? 'unknown error'}`);
}

async function findPendingQueue(
  userId: string,
  noticeId: string,
  anchorIso: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('email_lifecycle_queue')
    .select('id')
    .eq('campaign_key', GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('metadata->>notice_id', noticeId)
    .eq('metadata->>activity_anchor', anchorIso)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load pending gallery expiry warning: ${error.message}`);
  }
  return data ? { id: String(data.id) } : null;
}

async function linkNoticeQueue(noticeId: string, queueId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('gallery_expiry_notices')
    .update({ queue_id: queueId })
    .eq('id', noticeId)
    .is('queue_id', null);
  if (error) {
    throw new Error(`Failed to link gallery expiry notice: ${error.message}`);
  }
}

async function loadQueueRow(queueId: string): Promise<IQueueRow | null> {
  const { data, error } = await supabaseAdmin
    .from('email_lifecycle_queue')
    .select('id, campaign_key, user_id, status, metadata')
    .eq('id', queueId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load gallery expiry queue row: ${error.message}`);
  }
  return (data as IQueueRow | null) ?? null;
}

/**
 * True only when a queue row belongs to this exact notice and inactivity period.
 * A stale pending row from an older period must never be relabelled as the new one.
 */
function queueMatchesNotice(row: IQueueRow, userId: string, noticeId: string, anchorRaw: string): boolean {
  if (row.campaign_key !== GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY) return false;
  if (row.user_id !== userId) return false;
  const metadata = row.metadata ?? {};
  if (String(metadata.notice_id ?? '') !== noticeId) return false;
  return metadata.activity_anchor === anchorRaw;
}

async function processCandidate(
  candidate: IGalleryExpiryWarningCandidate,
  counters: IQueueGalleryExpiryWarningsResult
): Promise<void> {
  const userId = String(candidate.user_id);
  const anchorRaw = candidate.activity_anchor;
  if (!isValidAnchorRaw(anchorRaw)) {
    counters.failed += 1;
    return;
  }

  // 1. Idempotent notice for this stable period.
  const existingNotice = await findNotice(userId, anchorRaw);
  if (existingNotice?.warning_sent_at) {
    counters.alreadyDelivered += 1;
    return;
  }
  const noticeId = existingNotice?.id ?? (await insertNotice(userId, anchorRaw));

  // 2. Lost-response recovery: an existing pending warning for this period.
  const pending = await findPendingQueue(userId, noticeId, anchorRaw);
  if (pending) {
    if (!existingNotice?.queue_id) {
      await linkNoticeQueue(noticeId, pending.id);
    }
    counters.recovered += 1;
    return;
  }

  // 3. Enqueue. An unsent notice without a live queue row is a crash between the
  // notice insert and the queue insert, so re-enqueue it instead of blocking forever.
  const enqueue = await getEmailLifecycleService().queueLifecycleEmail({
    campaignKey: GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY,
    userId,
    templateData: {
      ctaUrl: `${serverEnv.BASE_URL}${GALLERY_EXPIRY_CTA_DESTINATION}`,
    },
    metadata: {
      activity_anchor: anchorRaw,
      notice_id: noticeId,
      cta_destination: GALLERY_EXPIRY_CTA_DESTINATION,
    },
  });

  if (!enqueue.queueId) {
    counters.failed += 1;
    return;
  }

  // 4. Never relabel an older pending row returned by the queue uniqueness guard.
  const queueRow = await loadQueueRow(enqueue.queueId);
  if (!queueRow || !queueMatchesNotice(queueRow, userId, noticeId, anchorRaw)) {
    counters.failed += 1;
    return;
  }

  await linkNoticeQueue(noticeId, enqueue.queueId);
  counters.warned += 1;
}

export async function queueGalleryExpiryWarnings(
  options: IQueueGalleryExpiryWarningsOptions = {}
): Promise<IQueueGalleryExpiryWarningsResult> {
  // Clear stale pending gallery warnings once before scanning, so the bounded cancel
  // pass sees freshly paid or reactivated users that never appear as candidates.
  await cancelStaleWarnings();

  const candidates = await loadCandidatePage(clampLimit(options.limit));
  const counters: IQueueGalleryExpiryWarningsResult = {
    scanned: candidates.length,
    warned: 0,
    recovered: 0,
    failed: 0,
    alreadyDelivered: 0,
  };

  for (const candidate of candidates) {
    try {
      await processCandidate(candidate, counters);
    } catch {
      counters.failed += 1;
    }
  }

  return counters;
}
