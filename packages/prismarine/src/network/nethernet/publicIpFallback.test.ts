import { describe, expect, it, vi } from 'vitest';

import { PUBLIC_IP_SERVICES } from '@jsprismarine/nethernet';
import { publicIpFallback } from './publicIpFallback';

const logger = () => ({ info: vi.fn(), warn: vi.fn() });

describe('publicIpFallback', () => {
    it('asks no service until a client needs the address, then asks once', async () => {
        const asked: string[] = [];
        const fetch = async (url: string) => {
            asked.push(url);
            if (asked.length === 1) throw new Error('fetch failed');
            return new Response('203.0.113.7\n');
        };
        const log = logger();
        const fallback = publicIpFallback(undefined, log, { fetch });

        expect(asked).toStrictEqual([]);
        expect(await fallback()).toBe('203.0.113.7');
        expect(await fallback()).toBe('203.0.113.7');
        expect(asked).toStrictEqual(PUBLIC_IP_SERVICES.slice(0, 2));
        expect(log.info).toHaveBeenCalledWith(expect.stringContaining('also offers 203.0.113.7'));
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('warns, naming server-public-ip, when the services report another address than it', async () => {
        const log = logger();
        const fallback = publicIpFallback('198.51.100.4', log, { fetch: async () => new Response('203.0.113.7') });

        expect(await fallback()).toBe('203.0.113.7');
        const [message] = log.warn.mock.calls[0]!;
        expect(message).toContain('server-public-ip 198.51.100.4');
        expect(message).toContain('203.0.113.7');
    });

    it('warns, naming server-public-ip and the switch, when no service answers', async () => {
        const log = logger();
        const fallback = publicIpFallback(undefined, log, {
            fetch: async () => {
                throw new Error('fetch failed');
            }
        });

        expect(await fallback()).toBeUndefined();
        const [message] = log.warn.mock.calls[0]!;
        expect(message).toContain(`${PUBLIC_IP_SERVICES[0]} failed: fetch failed`);
        expect(message).toContain('server-public-ip');
        expect(message).toContain('enable-server-public-ip-lookup');
    });
});
