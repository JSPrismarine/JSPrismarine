import type { SharedStat } from '@jsprismarine/entities';
import { JAVA_STAT_EXCEPTIONS, SHARED_STATS, statRuling } from '@jsprismarine/entities';
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

    it('takes every entity stat verdict from the decision rather than restating it', () => {
        // The id is `<stat>:<identifier>`, and the stat has to be one the decision knows, or
        // `statRuling` would read an authority that is not there.
        const isSharedStat = (value: string): value is SharedStat => value in SHARED_STATS;
        const stats = allowList.filter((entry) => entry.family === FAMILIES.entitiesStats);

        expect(stats.length).toBeGreaterThan(0);
        for (const entry of stats) {
            const divider = entry.id.indexOf(':');
            const stat = entry.id.slice(0, divider);
            expect(isSharedStat(stat), entry.id).toBe(true);
            if (!isSharedStat(stat)) continue;

            const ruling = statRuling(entry.id.slice(divider + 1), stat);
            expect(entry.kind, entry.id).toBe(ruling.kind === 'java' ? 'defect' : 'accepted');
            expect(entry.reason, entry.id).toBe(ruling.reason);
        }
    });

    it('carries every reviewed stat exception as its own row', () => {
        const ids = new Set(
            allowList.filter((entry) => entry.family === FAMILIES.entitiesStats).map((entry) => entry.id)
        );

        for (const row of JAVA_STAT_EXCEPTIONS) expect(ids).toContain(`${row.stat}:${row.identifier}`);
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
