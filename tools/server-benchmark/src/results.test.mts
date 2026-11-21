import { describe, expect, it } from 'vitest';

import { mergeSettings } from './results.mts';

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
