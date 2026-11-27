import { describe, expect, it } from 'vitest';

import { failedJspRuns, mergeSettings } from './results.mts';

import type { RunResult } from './results.mts';

const change = (key: string, value: string) => ({ key, value, default: '20', reason: 'Room for every bot.' });

describe('mergeSettings', () => {
    it('lists a change once with every scenario it applied to', () => {
        const flat = mergeSettings([], [change('max-players', '20')], 'flat');
        expect(mergeSettings(flat, [change('max-players', '20')], 'terrain')).toEqual([
            { ...change('max-players', '20'), scenarios: ['flat', 'terrain'] }
        ]);
    });

    it('keeps a value that differs between scenarios for each', () => {
        const flat = mergeSettings([], [change('max-players', '30')], 'flat');
        expect(mergeSettings(flat, [change('max-players', '40')], 'terrain')).toEqual([
            { ...change('max-players', '30'), scenarios: ['flat'] },
            { ...change('max-players', '40'), scenarios: ['terrain'] }
        ]);
    });
});

describe('failedJspRuns', () => {
    const run = (server: RunResult['server'], ok: boolean, error?: string): RunResult => ({
        server,
        scenario: 'flat',
        round: 0,
        position: 0,
        ok,
        ...(error === undefined ? {} : { error }),
        startedAt: '2026-11-27T00:00:00.000Z',
        load: { before: [0, 0, 0], after: [0, 0, 0] },
        startupMs: null,
        startupCpuMs: null,
        phases: null,
        peakRssBytes: 0,
        idleRssBytes: 0,
        processes: 0,
        bots: { requested: 1, joined: 0, grantedRadius: [], disconnects: [] }
    });

    it("lists JSPrismarine's failed runs with their errors", () => {
        expect(failedJspRuns([run('jsprismarine-nethernet', false, '10 bots left early'), run('bds', true)])).toEqual([
            'jsprismarine-nethernet flat round 1: 10 bots left early'
        ]);
    });

    it("leaves another server's failed run to its record", () => {
        expect(failedJspRuns([run('jsprismarine-nethernet', true), run('pumpkin', false, 'no join')])).toEqual([]);
    });
});
