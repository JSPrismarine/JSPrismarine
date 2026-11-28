/**
 * How the server offers its converted resource pack to Java clients: at a URL on its own Java
 * port, or under a base URL the owner publishes the packs to, and served from the port by SHA-1.
 */
import { createHash } from 'node:crypto';

import type { JavaResourcePackOffer, JavaServerAddress } from '../editions/java/javaResourcePack';
import type { JavaPortHttpHandler } from '../network/transport/TcpTransport';
import type { JavaResourcePack, JavaResourcePacks } from './JavaResourcePacks';
import { JAVA_PACK_CACHE_DIRECTORY } from './javaPackCache';

/** The path a pack is served at on the Java port, by its SHA-1. */
const PACK_PATH = /^\/resource-packs\/([0-9a-f]{40})\.zip$/;

/** How long a published URL that did not serve the new pack waits before it is checked again. */
export const PUBLICATION_RECHECK_MS = 60_000;

/**
 * How long one check of a published URL may take, its body included, before it counts as not
 * serving the pack: a join waits on the check, so a host that never finishes cannot hold it.
 */
export const PUBLICATION_CHECK_TIMEOUT_MS = 10_000;

/** What {@link javaResourcePackOffer} needs. */
export interface JavaResourcePackOfferOptions {
    readonly packs: Pick<JavaResourcePacks, 'current'>;
    /** The `java-resource-pack-url` setting: a base URL, or empty for the server's own port. */
    baseUrl(): string;
    /** The `texturepack-required` setting. */
    required(): boolean;
    /** How a published pack is checked; the global `fetch` when absent. */
    readonly fetch?: typeof fetch;
    /** The clock the rechecks follow; `Date.now` when absent. */
    readonly now?: () => number;
    readonly log: { warn(message: string): void };
}

/** A host as a URL spells it: an IPv6 address in brackets. */
const hostOf = (host: string): string => (host.includes(':') && !host.startsWith('[') ? `[${host}]` : host);

/** The URL a pack is published at under a base URL. */
const publishedUrl = (base: string, pack: JavaResourcePack): string => `${base.replace(/\/+$/, '')}/${pack.sha1}.zip`;

/**
 * The offer a Java client is pushed. Served from the server's own port, the current pack goes out
 * at once. Under a base URL, a pack goes out only once that URL serves bytes with its SHA-1, since
 * the owner uploads it there; until then the last pack it did serve goes out, and the log says
 * which file to upload under which name.
 */
export const javaResourcePackOffer = (options: JavaResourcePackOfferOptions): JavaResourcePackOffer => {
    const fetcher = options.fetch ?? fetch;
    const now = options.now ?? Date.now;
    const published = new Set<string>();
    const checkedAt = new Map<string, number>();
    let lastPublished: JavaResourcePack | undefined;

    const isPublished = async (base: string, pack: JavaResourcePack): Promise<boolean> => {
        if (published.has(pack.sha1)) return true;
        const last = checkedAt.get(pack.sha1);
        if (last !== undefined && now() - last < PUBLICATION_RECHECK_MS) return false;
        checkedAt.set(pack.sha1, now());
        const url = publishedUrl(base, pack);
        try {
            const response = await fetcher(url, { signal: AbortSignal.timeout(PUBLICATION_CHECK_TIMEOUT_MS) });
            if (response.ok) {
                const sha1 = createHash('sha1')
                    .update(new Uint8Array(await response.arrayBuffer()))
                    .digest('hex');
                if (sha1 === pack.sha1) {
                    published.add(pack.sha1);
                    return true;
                }
            } else await response.body?.cancel();
        } catch {
            // An unreachable URL is one that does not serve the pack yet.
        }
        options.log.warn(
            `Java clients get the converted resource pack once ${url} serves it: upload ${JAVA_PACK_CACHE_DIRECTORY}/${pack.key}.zip there, under the name ${pack.sha1}.zip`
        );
        return false;
    };

    return {
        async current() {
            const pack = await options.packs.current();
            const base = options.baseUrl();
            if (base === '' || pack === undefined) return pack;
            if (await isPublished(base, pack)) lastPublished = pack;
            return lastPublished;
        },
        urlOf(pack: JavaResourcePack, address: JavaServerAddress | undefined) {
            const base = options.baseUrl();
            if (base !== '') return publishedUrl(base, pack);
            const host = address === undefined || address.host === '' ? 'localhost' : address.host;
            return `http://${hostOf(host)}${address === undefined ? '' : `:${address.port}`}/resource-packs/${pack.sha1}.zip`;
        },
        required: () => options.required()
    };
};

/**
 * Answers HTTP on the Java port: `GET` or `HEAD` of `/resource-packs/<sha1>.zip` serves a pack the
 * server converted, and anything else is not found.
 */
export const javaResourcePackHttp =
    (packs: Pick<JavaResourcePacks, 'find'>): JavaPortHttpHandler =>
    (request, response) => {
        let pathname: string;
        try {
            pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        } catch {
            // A target such as `//[` is no URL, and no client the server pushed a pack to sends one.
            response.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request');
            return;
        }
        const match = PACK_PATH.exec(pathname);
        const pack = match === null ? undefined : packs.find(match[1]!);
        if (pack === undefined || (request.method !== 'GET' && request.method !== 'HEAD')) {
            response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
            return;
        }
        response.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Length': pack.bytes.byteLength,
            // The URL names the bytes by their hash, so they never change under it.
            'Cache-Control': 'public, max-age=31536000, immutable'
        });
        response.end(request.method === 'HEAD' ? undefined : pack.bytes);
    };
