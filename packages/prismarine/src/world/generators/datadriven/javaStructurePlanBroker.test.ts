import { describe, expect, it } from 'vitest';

import type { StructureStartCandidate, StructureStartPlanEntry } from './javaStructureStarts';
import { StructureStartPlanBroker } from './javaStructurePlanBroker';

describe('structure-start plan sharing', () => {
    it('coalesces overlapping requests before dispatching owner builds', async () => {
        const broker = new StructureStartPlanBroker();
        const first = { set: 'minecraft:villages', chunkX: 4, chunkZ: 7 } satisfies StructureStartCandidate;
        const overlap = { set: 'minecraft:villages', chunkX: 5, chunkZ: 7 } satisfies StructureStartCandidate;
        const last = { set: 'minecraft:villages', chunkX: 6, chunkZ: 7 } satisfies StructureStartCandidate;
        const requested = new Map<string, number>();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        const load = async (
            _owner: number,
            candidates: readonly StructureStartCandidate[]
        ): Promise<readonly StructureStartPlanEntry[]> => {
            for (const candidate of candidates) {
                const key = `${candidate.set}@${candidate.chunkX},${candidate.chunkZ}`;
                requested.set(key, (requested.get(key) ?? 0) + 1);
            }
            await gate;
            return candidates.map((candidate) => ({ ...candidate, start: null }));
        };
        const ownerOf = (): number => 0;

        const left = broker.plansFor([first, overlap], ownerOf, load);
        const right = broker.plansFor([overlap, last], ownerOf, load);
        await Promise.resolve();

        expect([...requested.values()].reduce((total, count) => total + count, 0)).toBe(3);
        expect(requested.get('minecraft:villages@5,7')).toBe(1);

        release();
        await expect(Promise.all([left, right])).resolves.toEqual([
            [
                { ...first, start: null },
                { ...overlap, start: null }
            ],
            [
                { ...overlap, start: null },
                { ...last, start: null }
            ]
        ]);
    });
});
