/** UUID-shaped values accepted by the legacy upload grant schema. */
export const UUID_SHAPED_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID contract for newly admitted processing jobs and refund attribution. */
export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidShaped(value: unknown): value is string {
  return typeof value === 'string' && UUID_SHAPED_PATTERN.test(value);
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}
