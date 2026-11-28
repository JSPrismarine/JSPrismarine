import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import type { RequestListener, Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import type { JavaResourcePack } from './JavaResourcePacks';
import { javaResourcePackHttp, javaResourcePackOffer, PUBLICATION_RECHECK_MS } from './javaResourcePackOffer';

const packOf = (text: string): JavaResourcePack => {
    const bytes = new TextEncoder().encode(text);
    return {
        id: '00000000-0000-4000-8000-000000000001',
        key: 'k'.repeat(64),
        sha1: createHash('sha1').update(bytes).digest('hex'),
        bytes
    };
};

const servers: Server[] = [];
afterEach(() => {
    for (const server of servers.splice(0)) server.close();
});

/** A local HTTP server answering with a listener, and the base URL it listens at. */
const listen = async (listener: RequestListener): Promise<string> => {
    const server = createServer(listener);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new TypeError('the server listens on no TCP port');
    return `http://127.0.0.1:${address.port}`;
};

describe('javaResourcePackOffer', () => {
    const pack = packOf('pack');

    it("points a client at the server's own Java port, as the address it dialed", async () => {
        const offer = javaResourcePackOffer({
            packs: { current: async () => pack },
            baseUrl: () => '',
            required: () => true,
            log: { warn: () => {} }
        });

        expect(await offer.current()).toBe(pack);
        expect(offer.urlOf(pack, { host: 'mc.example.com', port: 25565 })).toBe(
            `http://mc.example.com:25565/resource-packs/${pack.sha1}.zip`
        );
        expect(offer.urlOf(pack, { host: '::1', port: 25565 })).toBe(
            `http://[::1]:25565/resource-packs/${pack.sha1}.zip`
        );
        expect(offer.required()).toBe(true);
    });

    it('offers a pack under a base URL only once that URL serves it, checking again after a while', async () => {
        let current = pack;
        const published = new Map<string, Uint8Array>();
        const requested: string[] = [];
        const base = await listen((incoming, response) => {
            requested.push(incoming.url ?? '');
            const body = published.get(incoming.url ?? '');
            if (body === undefined) response.writeHead(404).end();
            else response.writeHead(200).end(body);
        });
        const warnings: string[] = [];
        let clock = 0;
        const offer = javaResourcePackOffer({
            packs: { current: async () => current },
            baseUrl: () => `${base}/packs/`,
            required: () => false,
            now: () => clock,
            log: { warn: (message) => warnings.push(message) }
        });
        const path = `/packs/${pack.sha1}.zip`;

        expect(offer.urlOf(pack, undefined)).toBe(`${base}${path}`);
        expect(await offer.current()).toBeUndefined();
        expect(await offer.current()).toBeUndefined();
        expect(requested).toEqual([path]);
        expect(warnings[0]).toContain(`upload cache/java-packs/${pack.key}.zip`);

        published.set(path, pack.bytes);
        clock += PUBLICATION_RECHECK_MS;
        expect(await offer.current()).toBe(pack);

        // A new pack nobody uploaded yet leaves the published one on offer.
        current = packOf('newer');
        expect(await offer.current()).toBe(pack);
    });
});

describe('javaResourcePackHttp', () => {
    const pack = packOf('the pack');

    const get = async (path: string, method = 'GET') => {
        const base = new URL(
            await listen(javaResourcePackHttp({ find: (sha1) => (sha1 === pack.sha1 ? pack : undefined) }))
        );
        return new Promise<{ status: number; type: string | undefined; body: string }>((resolve, reject) => {
            const sent = request({ host: base.hostname, port: base.port, path, method }, (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () =>
                    resolve({
                        status: response.statusCode ?? 0,
                        type: response.headers['content-type'],
                        body: Buffer.concat(chunks).toString()
                    })
                );
            });
            sent.on('error', reject);
            sent.end();
        });
    };

    it('serves a converted pack by its SHA-1 and nothing else', async () => {
        expect(await get(`/resource-packs/${pack.sha1}.zip`)).toEqual({
            status: 200,
            type: 'application/zip',
            body: 'the pack'
        });
        expect(await get(`/resource-packs/${pack.sha1}.zip`, 'HEAD')).toMatchObject({ status: 200, body: '' });
        expect((await get(`/resource-packs/${'0'.repeat(40)}.zip`)).status).toBe(404);
        expect((await get('/')).status).toBe(404);
    });
});
