import { describe, expect, it } from 'vitest';

import {
    DuplicateFeaturePatchError,
    FEATURE_PATCH_ORDER,
    FeaturePatchOutOfRangeError,
    InboundFeaturePatches
} from './FeaturePatch';

/** A seeded shuffle, so a test that depends on an arrival order still reproduces. */
const shuffled = <T>(values: readonly T[], seed: number): T[] => {
    const order = [...values];
    let state = seed;
    for (let at = order.length - 1; at > 0; at--) {
        state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
        const pick = state % (at + 1);
        [order[at], order[pick]] = [order[pick]!, order[at]!];
    }
    return order;
};

describe('the merge order', () => {
    it('is the eight neighbors, dx ascending fastest', () => {
        expect(FEATURE_PATCH_ORDER.map(([dx, dz]) => `${dx},${dz}`)).toEqual([
            '-1,-1',
            '0,-1',
            '1,-1',
            '-1,0',
            '1,0',
            '-1,1',
            '0,1',
            '1,1'
        ]);
    });

    it('leaves out the chunk itself, whose writes apply as they happen', () => {
        expect(FEATURE_PATCH_ORDER.some(([dx, dz]) => dx === 0 && dz === 0)).toBe(false);
    });
});

describe('taking a patch', () => {
    it('refuses the chunk itself', () => {
        const inbound = new InboundFeaturePatches<string>();

        expect(() => inbound.receive(0, 0, 'own')).toThrow(FeaturePatchOutOfRangeError);
    });

    it('refuses a chunk past the features write radius', () => {
        const inbound = new InboundFeaturePatches<string>();

        expect(() => inbound.receive(2, 0, 'far')).toThrow(FeaturePatchOutOfRangeError);
        expect(() => inbound.receive(-1, 2, 'far')).toThrow(FeaturePatchOutOfRangeError);
    });

    it('refuses a second patch from the same neighbor, which means its step ran twice', () => {
        const inbound = new InboundFeaturePatches<string>();
        inbound.receive(1, 0, 'first');

        expect(() => inbound.receive(1, 0, 'second')).toThrow(DuplicateFeaturePatchError);
    });

    it('records which neighbors have handed one over', () => {
        const inbound = new InboundFeaturePatches<string>();
        inbound.receive(-1, 1, 'southwest');

        expect(inbound.has(-1, 1)).toBe(true);
        expect(inbound.has(1, -1)).toBe(false);
        expect(inbound.size).toBe(1);
    });
});

describe('merging', () => {
    it('applies the patches in position order whatever order they arrived in', () => {
        const arrivals = FEATURE_PATCH_ORDER.map(([dx, dz]) => [dx, dz, `${dx},${dz}`] as const);
        const expected = arrivals.map(([, , patch]) => patch);

        for (const seed of [1, 7, 99, 12_345, 2_024]) {
            const inbound = new InboundFeaturePatches<string>();
            for (const [dx, dz, patch] of shuffled(arrivals, seed)) inbound.receive(dx, dz, patch);

            expect(inbound.inMergeOrder()).toEqual(expected);
        }
    });

    it('skips the neighbors that wrote nothing', () => {
        const inbound = new InboundFeaturePatches<string>();
        inbound.receive(1, 1, 'southeast');
        inbound.receive(0, -1, 'north');

        expect(inbound.inMergeOrder()).toEqual(['north', 'southeast']);
    });

    it('settles a contested block the same way whichever neighbor arrived first', () => {
        // Two neighbors both write a block at the same position. The last patch in the merge
        // order wins, and which one that is must not depend on who finished first.
        const won = (first: readonly [number, number], second: readonly [number, number]): string => {
            const inbound = new InboundFeaturePatches<string>();
            inbound.receive(first[0], first[1], `${first[0]},${first[1]}`);
            inbound.receive(second[0], second[1], `${second[0]},${second[1]}`);
            return inbound.inMergeOrder().at(-1)!;
        };

        expect(won([1, 1], [-1, -1])).toBe('1,1');
        expect(won([-1, -1], [1, 1])).toBe('1,1');
        expect(won([0, 1], [1, 0])).toBe('0,1');
        expect(won([1, 0], [0, 1])).toBe('0,1');
    });
});
