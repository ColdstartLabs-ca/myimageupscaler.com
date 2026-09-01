/**
 * Error raised when a request body exceeds the caller's byte limit.
 *
 * The status is kept on the error so route handlers can translate this
 * transport-level failure without exposing parser details to clients.
 */
export class BoundedJsonBodyTooLargeError extends Error {
  readonly code = 'REQUEST_BODY_TOO_LARGE';
  readonly statusCode = 413;

  constructor(
    readonly maxBytes: number,
    readonly actualBytes: number
  ) {
    super(`Request body exceeds the ${maxBytes}-byte limit`);
    this.name = 'BoundedJsonBodyTooLargeError';
  }
}

function assertValidLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('The JSON body limit must be a positive safe integer');
  }
}

function getDeclaredContentLength(request: Request): number | undefined {
  const rawLength = request.headers.get('content-length');
  if (rawLength === null) return undefined;

  const parsedLength = Number(rawLength);
  return Number.isFinite(parsedLength) && parsedLength >= 0 ? parsedLength : undefined;
}

/**
 * Read and parse JSON while retaining no more than `maxBytes` of encoded body
 * data. Content-Length is an early rejection hint only; streamed bytes are
 * counted independently because the header may be absent or dishonest.
 */
export async function readBoundedJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  assertValidLimit(maxBytes);

  const declaredLength = getDeclaredContentLength(request);
  if (declaredLength !== undefined && declaredLength > maxBytes) {
    throw new BoundedJsonBodyTooLargeError(maxBytes, declaredLength);
  }

  if (!request.body) {
    throw new SyntaxError('Request body is empty');
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        chunks.push(decoder.decode());
        break;
      }

      if (value === undefined) {
        throw new SyntaxError('Request body stream returned an empty chunk');
      }

      const chunkBytes = value.byteLength;
      const nextBytesRead = bytesRead + chunkBytes;
      if (nextBytesRead > maxBytes) {
        await reader.cancel('request body exceeds configured limit').catch(() => undefined);
        throw new BoundedJsonBodyTooLargeError(maxBytes, nextBytesRead);
      }

      bytesRead = nextBytesRead;
      if (chunkBytes > 0) {
        chunks.push(decoder.decode(value, { stream: true }));
      }
    }
  } finally {
    reader.releaseLock();
  }

  // JSON.parse runs only after the complete encoded body has passed the byte
  // limit. The bounded string is safe to materialize for this metadata route.
  return JSON.parse(chunks.join(''));
}
