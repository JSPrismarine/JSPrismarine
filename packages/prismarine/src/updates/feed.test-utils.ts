import assert from 'node:assert';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';

/** A feed as the workflows write it. */
export const feedOf = (version: string, channel: 'release' | 'nightly' = 'release') => ({
    schema: 1,
    channel,
    version,
    published: '2026-11-24T20:23:15Z',
    commit: '0e3e8864d57',
    url: `https://github.com/JSPrismarine/JSPrismarine/releases/tag/jsprismarine%40${version}`,
    notes: 'https://jsprismarine.dev/releases#v0-25-0',
    assets: {
        'linux-x64': {
            url: 'https://github.com/JSPrismarine/JSPrismarine/releases/download/x/prismarine-linux-x64',
            sha256: 'a'.repeat(64),
            size: 1024
        }
    }
});

/**
 * A local HTTP server standing in for every feed host, and the fetch that sends each request to
 * it: an `https://<host>/<path>` URL is served from `<path>` here, so a feed's URL keys its file.
 * Close it once the test is done.
 */
export const feedServer = async (files: Record<string, unknown>) => {
    const requests: { url: string; userAgent: string | null }[] = [];
    const byPath = (): Map<string, unknown> =>
        new Map(Object.entries(files).map(([url, body]) => [new URL(url).pathname, body]));
    const server: HttpServer = createServer((request, response) => {
        const body = byPath().get(request.url ?? '');
        if (body === undefined) response.writeHead(404).end('Not Found');
        else response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address !== null && typeof address === 'object', 'listen() on a TCP port gives an AddressInfo');
    const local = `http://127.0.0.1:${address.port}`;
    const fetcher: typeof fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        requests.push({ url: url.href, userAgent: new Headers(init?.headers).get('user-agent') });
        return fetch(`${local}${url.pathname}`, init);
    };
    const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
    return { fetch: fetcher, requests, close };
};
