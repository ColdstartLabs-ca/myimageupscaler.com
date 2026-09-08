import { Readable } from 'node:stream';
import streamJson from 'stream-json';

interface IFrame {
  value: Record<string, unknown> | unknown[];
  path: string[];
  key: string;
}

/** Unpack the one image string as bytes; never retain encoded transport strings. */
export async function readGeminiResponse(
  response: Response,
  maxTransportBytes: number,
  maxImageBytes: number
): Promise<Record<string, unknown>> {
  const declared = response.headers.get('content-length');
  if (
    declared !== null &&
    (!Number.isSafeInteger(Number(declared)) ||
      Number(declared) < 0 ||
      Number(declared) > maxTransportBytes)
  ) {
    await response.body?.cancel();
    throw new Error('Gemini response exceeds the executor byte limit');
  }
  if (!response.body) throw new Error('Gemini response has no body');
  let observed = 0;
  const source = Readable.fromWeb(
    response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          observed += chunk.byteLength;
          if (observed > maxTransportBytes)
            throw new Error('Gemini response exceeds the executor byte limit');
          controller.enqueue(chunk);
        },
      })
    ) as Parameters<typeof Readable.fromWeb>[0]
  );
  const tokens = streamJson.parser({ packValues: false });
  source.on('error', error => tokens.destroy(error));
  source.pipe(tokens);
  const stack: IFrame[] = [];
  let root: unknown;
  let key = '';
  let value = '';
  let readingKey = false;
  let image = false;
  let keepString = false;
  let imageCount = 0;
  let imageBytes = 0;
  let metadataBytes = 0;
  let nodes = 0;
  let encoded = '';
  const decoded: Buffer[] = [];
  const path = (): string[] => {
    const parent = stack.at(-1);
    return parent
      ? [...parent.path, Array.isArray(parent.value) ? String(parent.value.length) : parent.key]
      : [];
  };
  const attach = (item: unknown): void => {
    if (++nodes > 10_000) throw new Error('Gemini response metadata exceeds node limit');
    const parent = stack.at(-1);
    if (!parent) {
      root = item;
      return;
    }
    if (Array.isArray(parent.value)) parent.value.push(item);
    else {
      if (Object.hasOwn(parent.value, parent.key))
        throw new Error('Gemini response contains duplicate keys');
      parent.value[parent.key] = item;
    }
  };
  const decode = (text: string): void => {
    if (!text) return;
    const bytes = Buffer.from(text, 'base64');
    imageBytes += bytes.byteLength;
    if (imageBytes > maxImageBytes)
      throw new Error('Gemini output exceeds the executor byte limit');
    decoded.push(bytes);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      tokens.once('end', resolve);
      tokens.once('error', reject);
      tokens.on('data', (token: { name: string; value?: string }) => {
        try {
          switch (token.name) {
            case 'startObject':
            case 'startArray': {
              if (stack.length >= 64) throw new Error('Gemini response nesting exceeds limit');
              const frame: IFrame = {
                value: token.name === 'startArray' ? [] : Object.create(null),
                path: path(),
                key: '',
              };
              attach(frame.value);
              stack.push(frame);
              break;
            }
            case 'endObject':
            case 'endArray':
              stack.pop();
              break;
            case 'startKey':
              readingKey = true;
              key = '';
              break;
            case 'endKey':
              readingKey = false;
              stack.at(-1)!.key = key;
              break;
            case 'startString': {
              const currentPath = path();
              image = /^candidates\.0\.content\.parts\.\d+\.inlineData\.data$/.test(
                currentPath.join('.')
              );
              if (image && ++imageCount > 1)
                throw new Error('Gemini returned multiple inline images');
              keepString = [
                'responseId',
                'modelVersion',
                'finishReason',
                'mimeType',
                'fileUri',
                'blockReason',
              ].includes(currentPath.at(-1) ?? '');
              value = '';
              encoded = '';
              break;
            }
            case 'stringChunk': {
              const chunk = token.value ?? '';
              if (readingKey) {
                key += chunk;
                if (key.length > 256) throw new Error('Gemini response key exceeds limit');
              } else if (image) {
                if (!/^[A-Za-z0-9+/=]*$/.test(chunk))
                  throw new Error('Gemini returned invalid inline image data');
                encoded += chunk;
                if (encoded.length >= 64 * 1024) {
                  const length = Math.floor((encoded.length - 4) / 4) * 4;
                  const part = encoded.slice(0, length);
                  if (part.includes('='))
                    throw new Error('Gemini returned invalid inline image padding');
                  decode(part);
                  encoded = encoded.slice(length);
                }
              } else if (keepString) {
                metadataBytes += chunk.length;
                if (metadataBytes > 64 * 1024)
                  throw new Error('Gemini response metadata exceeds limit');
                value += chunk;
              }
              break;
            }
            case 'endString':
              if (image) {
                if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
                  throw new Error('Gemini returned invalid inline image data');
                decode(encoded);
                attach(Buffer.concat(decoded, imageBytes));
                decoded.length = 0;
              } else attach(value);
              image = false;
              break;
            case 'startNumber':
              value = '';
              break;
            case 'numberChunk':
              value += token.value ?? '';
              if (value.length > 64) throw new Error('Gemini numeric metadata exceeds limit');
              break;
            case 'endNumber':
              attach(Number(value));
              break;
            case 'nullValue':
              attach(null);
              break;
            case 'trueValue':
              attach(true);
              break;
            case 'falseValue':
              attach(false);
              break;
          }
        } catch (error) {
          tokens.destroy(error instanceof Error ? error : new Error('Invalid Gemini response'));
        }
      });
    });
    if (declared !== null && observed !== Number(declared))
      throw new Error('Gemini response length mismatch');
    if (!root || typeof root !== 'object' || Array.isArray(root))
      throw new Error('Gemini returned malformed JSON');
    return root as Record<string, unknown>;
  } finally {
    source.destroy();
    tokens.destroy();
  }
}
