import { BLOCK_LOSSES, BLOCK_MERGES } from '@jsprismarine/mapping';
import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { allowList, checkAllowList } from './allowlist.ts';

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

    it('carries the reviewed mapping losses as rows, derived from the loss list itself', () => {
        const blockLosses = allowList.filter((entry) => entry.family === FAMILIES.mappingBlocks);

        expect(blockLosses.length).toBe(BLOCK_LOSSES.length + BLOCK_MERGES.length);
        for (const loss of BLOCK_LOSSES) {
            expect(blockLosses).toContainEqual({
                family: FAMILIES.mappingBlocks,
                id: `loss:${loss.javaId}`,
                kind: 'accepted',
                reason: loss.reason,
                reference: loss.reference
            });
        }
    });

    it('gives every entry a kind, so a defect never reads as an accepted gap', () => {
        for (const entry of allowList) expect(['accepted', 'defect']).toContain(entry.kind);
    });

    it('reports an entry whose gap closed as stale', () => {
        const entries = [
            {
                family: FAMILIES.registryItems,
                id: 'minecraft:closed_gap',
                kind: 'accepted' as const,
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
            {
                family: FAMILIES.registryItems,
                id: 'minecraft:open_gap',
                kind: 'accepted' as const,
                reason: 'fixture',
                reference: 'this test'
            }
        ];

        expect(checkAllowList(FAMILIES.registryItems, ['minecraft:open_gap'], entries)).toEqual({
            unexpected: [],
            stale: []
        });
    });
});
