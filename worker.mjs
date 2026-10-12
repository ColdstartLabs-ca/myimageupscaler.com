import handler from './.open-next/worker.js';

export * from './.open-next/worker.js';

export default {
  async fetch(request, env, ctx) {
    const response = await handler.fetch(request, env, ctx);
    const length = response.headers.get('content-length');
    if (
      !/^\/api\/gallery\/thumb\/[^/]+\/?$/.test(new URL(request.url).pathname) ||
      response.status !== 200 ||
      !response.body ||
      !/^image\//i.test(response.headers.get('content-type') ?? '') ||
      !/^[1-9]\d*$/.test(length ?? '') ||
      !Number.isSafeInteger(Number(length))
    ) {
      return response;
    }

    // OpenNext's generic stream loses the known byte length at the Worker boundary.
    const stream = new FixedLengthStream(Number(length));
    ctx.waitUntil(response.body.pipeTo(stream.writable));
    return new Response(stream.readable, response);
  },
};
