import { describe, expect, it } from 'vitest';

import { lookupPublicIp, PUBLIC_IP_SERVICES } from './publicIpLookup';

/** A transport that answers each service from a table and records which it was asked. */
const answering = (answers: Record<string, () => Response | Promise<Response>>) => {
    const asked: string[] = [];
    const fetch = async (url: string): Promise<Response> => {
        asked.push(url);
        const answer = answers[url];
        if (answer === undefined) throw new Error('getaddrinfo ENOTFOUND');
        return answer();
    };
    return { asked, fetch };
};

describe('lookupPublicIp', () => {
    it('asks each service in order and stops at the first public address', async () => {
        const { asked, fetch } = answering({
            'https://b.example': () => new Response('203.0.113.7\n'),
            'https://c.example': () => new Response('198.51.100.1')
        });

        const result = await lookupPublicIp({
            services: ['https://a.example', 'https://b.example', 'https://c.example'],
            fetch
        });

        expect(result).toStrictEqual({ address: '203.0.113.7', service: 'https://b.example' });
        expect(asked).toStrictEqual(['https://a.example', 'https://b.example']);
    });

    it('skips an error status, an answer that is no address, and a private address', async () => {
        const { fetch } = answering({
            'https://down.example': () => new Response('Too Many Requests', { status: 429 }),
            'https://html.example': () => new Response('<html>203.0.113.7</html>'),
            'https://private.example': () => new Response('192.168.1.5')
        });

        const result = await lookupPublicIp({
            services: ['https://down.example', 'https://html.example', 'https://private.example'],
            fetch
        });

        expect(result).toStrictEqual({
            failures: [
                'https://down.example answered HTTP 429',
                'https://html.example answered no public IP address',
                'https://private.example answered no public IP address'
            ]
        });
    });

    it('moves on from a service that does not answer in time', async () => {
        const fetch = async (url: string, { signal }: { readonly signal: AbortSignal }): Promise<Response> => {
            if (url === 'https://fast.example') return new Response('203.0.113.9');
            return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
        };

        const result = await lookupPublicIp({
            services: ['https://slow.example', 'https://fast.example'],
            fetch,
            timeoutMs: 1
        });

        expect(result).toStrictEqual({ address: '203.0.113.9', service: 'https://fast.example' });
    });

    it('reports why each service failed', async () => {
        const { fetch } = answering({});

        const result = await lookupPublicIp({ services: ['https://a.example'], fetch });

        expect(result).toStrictEqual({ failures: ['https://a.example failed: getaddrinfo ENOTFOUND'] });
    });

    it('asks nothing once stopped', async () => {
        const { asked, fetch } = answering({ 'https://a.example': () => new Response('203.0.113.7') });

        const result = await lookupPublicIp({
            services: ['https://a.example'],
            fetch,
            signal: AbortSignal.abort()
        });

        expect(result).toStrictEqual({ failures: [] });
        expect(asked).toStrictEqual([]);
    });

    it('asks the built-in services, all over HTTPS, when given none', async () => {
        const { asked, fetch } = answering({});

        await lookupPublicIp({ fetch });

        expect(asked).toStrictEqual([...PUBLIC_IP_SERVICES]);
        expect(asked.length).toBeGreaterThan(1);
        for (const service of asked) expect(new URL(service).protocol).toBe('https:');
    });
});
