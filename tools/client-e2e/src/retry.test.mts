import { describe, expect, it } from 'vitest';

import { mergeRetries, retrySuites } from './retry.mts';

const suites = [
    { name: 'gameplay', scenarios: [{ name: 'chat' }, { name: 'lever-lamp' }, { name: 'furnace' }] },
    { name: 'natural-spawn', scenarios: [{ name: 'spawn-placement' }] }
];

describe('retrySuites', () => {
    it('keeps the failed scenarios of each suite, in order', () => {
        const results = [
            { name: 'chat', ok: false, note: 'no echo' },
            { name: 'lever-lamp', ok: true, note: '' },
            { name: 'furnace', ok: false, note: 'no smelt' },
            { name: 'spawn-placement', ok: true, note: '' }
        ];

        expect(retrySuites(suites, results)).toEqual([
            { name: 'gameplay-retry', scenarios: [{ name: 'chat' }, { name: 'furnace' }] }
        ]);
    });

    it('retries nothing when every scenario passed', () => {
        expect(retrySuites(suites, [{ name: 'chat', ok: true, note: '' }])).toEqual([]);
    });
});

describe('mergeRetries', () => {
    const first = [
        { name: 'chat', ok: true, note: 'echoes' },
        { name: 'lever-lamp', ok: false, note: 'lamp stayed dark' },
        { name: 'furnace', ok: false, note: 'no smelt' }
    ];

    it('passes a scenario that passed its retry and says how it first failed', () => {
        const merged = mergeRetries(first, [
            { name: 'lever-lamp', ok: true, note: 'lights the lamp' },
            { name: 'furnace', ok: false, note: 'still no smelt' }
        ]);

        expect(merged).toEqual([
            { name: 'chat', ok: true, note: 'echoes' },
            { name: 'lever-lamp', ok: true, retried: true, note: 'passed on retry; first attempt: lamp stayed dark' },
            { name: 'furnace', ok: false, note: 'still no smelt' }
        ]);
    });

    it('keeps a failure that had no retry', () => {
        expect(mergeRetries(first, [])).toEqual(first);
    });
});
