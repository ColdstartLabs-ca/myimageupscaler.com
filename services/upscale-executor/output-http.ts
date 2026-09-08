import { lookup } from 'node:dns';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

export function isPublicAddress(address: string): boolean {
  if (address.toLowerCase().startsWith('::ffff:')) return isPublicAddress(address.slice(7));
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(address) === 6)
    return /^[23]/i.test(address) && !address.toLowerCase().startsWith('2001:db8:');
  return false;
}

/** Validate the address used by the socket itself, including redirected hosts. */
export const fetchPublicOutput: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error('Provider output URL is invalid');
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        signal: init?.signal ?? undefined,
        // Node 22 accepts this net option; the repository also supports older Node types.
        ...{ autoSelectFamily: false },
        lookup: (hostname, _options, callback) =>
          lookup(hostname, { all: true }, (error, addresses) => {
            if (error) return callback(error, '', 4);
            if (addresses.some(candidate => !isPublicAddress(candidate.address)))
              return callback(
                new Error('Provider output URL resolved to a private address'),
                '',
                4
              );
            const address = addresses[0];
            if (!address)
              return callback(new Error('Provider output host has no addresses'), '', 4);
            callback(null, address.address, address.family);
          }),
      },
      response => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        resolve(
          new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
            status: response.statusCode ?? 502,
            headers,
          })
        );
      }
    );
    req.once('error', reject);
    req.end();
  });
};
