import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadNative, nativeLibraryAvailable } from './testing/native.test.helper';
import { runLoopback } from './testing/loopback';

/** A Bun to run the same exchange under: `JSP_BUN`, or `bun` on the path. */
const bun = (): string | undefined => {
    const candidate = process.env.JSP_BUN ?? 'bun';
    return spawnSync(candidate, ['--version']).status === 0 ? candidate : undefined;
};

describe.skipIf(!nativeLibraryAvailable())('a native peer connection', async () => {
    const network = await loadNative();

    it('opens NetherNet’s two channels and delivers every byte under Node.js', async () => {
        const result = await runLoopback(network, {}, 300, 1200);

        expect(result.bytesSent).toBe(360_000);
        expect(result.bytesReceived).toBe(result.bytesSent);
        expect(result.answererPair?.remote).toMatch(/127\.0\.0\.1 \d+ typ/);
    });

    it('serves two peers from one mux port at once', async () => {
        const [first, second] = await Promise.all([
            runLoopback(network, { enableIceUdpMux: true, portRangeBegin: 19_871, portRangeEnd: 19_871 }),
            runLoopback(network, { enableIceUdpMux: true, portRangeBegin: 19_871, portRangeEnd: 19_871 })
        ]);

        for (const result of [first, second]) {
            expect(result.bytesReceived).toBe(result.bytesSent);
            expect(/ (\d+) typ /.exec(result.answererPair?.local ?? '')?.[1]).toBe('19871');
        }
        expect(first.answererPair?.remote).not.toBe(second.answererPair?.remote);
    });

    it('serves peers on two mux ports at once, each on its own port', async () => {
        // libjuice keeps one mux registry per port, found by the port a peer asks for.
        const [first, second] = await Promise.all([
            runLoopback(network, { enableIceUdpMux: true, portRangeBegin: 19_873, portRangeEnd: 19_873 }),
            runLoopback(network, { enableIceUdpMux: true, portRangeBegin: 19_874, portRangeEnd: 19_874 })
        ]);

        expect(/ (\d+) typ /.exec(first.answererPair?.local ?? '')?.[1]).toBe('19873');
        expect(/ (\d+) typ /.exec(second.answererPair?.local ?? '')?.[1]).toBe('19874');
        expect(first.bytesReceived).toBe(first.bytesSent);
        expect(second.bytesReceived).toBe(second.bytesSent);
    });

    it('wakes JavaScript far fewer times than it delivers events', async () => {
        const before = network.wakes;
        const result = await runLoopback(network, {}, 500, 1000);

        expect(result.bytesReceived).toBe(500_000);
        // 500 messages and the connection's own events, in batches.
        expect(network.wakes - before).toBeLessThan(500);
    });

    it.skipIf(bun() === undefined)('delivers every byte under Bun', () => {
        const script = fileURLToPath(new URL('./testing/loopback-main.ts', import.meta.url));
        const run = spawnSync(bun()!, [script, '19872'], { encoding: 'utf8', timeout: 60_000 });

        expect(run.status, run.stderr).toBe(0);
        const result = JSON.parse(run.stdout.trim()) as { runtime: string; bytesSent: number; bytesReceived: number };
        expect(result).toMatchObject({ runtime: 'bun', bytesSent: 100_000, bytesReceived: 100_000 });
    });
});
