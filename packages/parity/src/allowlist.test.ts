import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';

// These tests pin the two failure modes the mechanism promises: a gap with no entry is
// unexpected, and an entry whose gap closed is stale. The first two read the real allow list
// through families it carries no entries for; the rest feed fixture entries.
describe('allow list', () => {
    it('reports a gap with no entry as unexpected', () => {
        const verdict = checkAllowList(FAMILIES.registryBlocks, ['minecraft:made_up_block']);

        expect(verdict.unexpected).toEqual(['minecraft:made_up_block']);
        expect(verdict.stale).toEqual([]);
    });

    it('reports nothing when the comparison reports nothing and the family has no entries', () => {
        expect(checkAllowList(FAMILIES.registryItems, [])).toEqual({ unexpected: [], stale: [] });
    });

    it('reports an entry whose gap closed as stale', () => {
        const entries = [
            {
                family: FAMILIES.registryItems,
                id: 'minecraft:closed_gap',
                reason: 'fixture',
                reference: 'this test'
            }
        ];

        const verdict = checkAllowList(FAMILIES.registryItems, [], entries);

        expect(verdict.stale).toEqual(['minecraft:closed_gap']);
        expect(verdict.unexpected).toEqual([]);
    });

    it('allows a gap its entry covers without marking it stale', () => {
        const entries = [
            { family: FAMILIES.registryItems, id: 'minecraft:open_gap', reason: 'fixture', reference: 'this test' }
        ];

        expect(checkAllowList(FAMILIES.registryItems, ['minecraft:open_gap'], entries)).toEqual({
            unexpected: [],
            stale: []
        });
    });
});
