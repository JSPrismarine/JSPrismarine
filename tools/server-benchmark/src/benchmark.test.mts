import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { roundOrder, runOnce, stepTarget } from './benchmark.mts';
import { SERVERS } from './servers.mts';

import type { RunResult } from './results.mts';

describe('roundOrder', () => {
    it('puts every server in every position once over as many rounds as there are servers', () => {
        const servers = ['jsprismarine-nethernet', 'pumpkin', 'bds'] as const;
        const orders = [0, 1, 2].map((round) => roundOrder(servers, round));
        expect(orders).toEqual([
            ['jsprismarine-nethernet', 'pumpkin', 'bds'],
            ['pumpkin', 'bds', 'jsprismarine-nethernet'],
            ['bds', 'jsprismarine-nethernet', 'pumpkin']
        ]);
        for (const position of [0, 1, 2]) {
            expect(new Set(orders.map((order) => order[position]))).toEqual(new Set(servers));
        }
    });
});

describe('stepTarget', () => {
    it('moves each bot the same distance per step along its own heading', () => {
        const targets = [0, 1, 2, 3].map((index) => stepTarget(index, 4, 2, 64));
        expect(targets).toEqual([
            { x: 128, z: 0 },
            { x: 0, z: 128 },
            { x: -128, z: 0 },
            { x: 0, z: -128 }
        ]);
    });
});

// Starts a real JSPrismarine server from the built packages and joins a bot. It measures nothing
// the assertions depend on, but its run time depends on the machine, so CI leaves it out.
describe('runOnce against JSPrismarine', { tags: ['performance'] }, () => {
    let result: RunResult;

    beforeAll(async () => {
        const workDir = mkdtempSync(path.join(tmpdir(), 'jsp-server-benchmark-test-'));
        try {
            result = await runOnce({
                server: SERVERS['jsprismarine-raknet'],
                scenario: {
                    id: 'flat',
                    worlds: { 'jsprismarine-raknet': SERVERS['jsprismarine-raknet'].world('flat') },
                    bots: 1,
                    viewDistance: 4,
                    simulationDistance: 10,
                    steps: 1,
                    stepBlocks: 64,
                    teleportY: -60,
                    idleMs: 1_000,
                    stepTimeoutMs: 60_000
                },
                round: 0,
                position: 0,
                workDir,
                seed: 1,
                port: 19_472,
                readyTimeoutMs: 240_000,
                loginTimeoutMs: 60_000,
                stopTimeoutMs: 60_000,
                quietLoadLimit: Number.POSITIVE_INFINITY,
                cooldownMs: 60_000,
                log: () => {}
            });
        } finally {
            rmSync(workDir, { recursive: true, force: true });
        }
    }, 300_000);

    it('finishes every phase with the bot joined', () => {
        expect(result.error).toBeUndefined();
        expect(result.bots.joined).toBe(1);
        expect(result.bots.disconnects).toEqual([]);
    });

    it('counts the columns and bytes the bot received while it traveled', () => {
        expect(result.phases?.travel.columns).toBeGreaterThan(0);
        expect(result.phases?.travel.bytesReceived).toBeGreaterThan(0);
    });

    it('samples the memory of the server process', () => {
        expect(result.peakRssBytes).toBeGreaterThan(0);
    });
});
