import { describe, expect, it } from 'vitest';

import type { PlacementGroup, PlacementMismatch } from '../../vectors/placement';
import {
    PLACEMENT_GAPS,
    describePlacement,
    placementCount,
    placementGapOf,
    placementMismatches,
    placementVectors
} from '../../vectors/placement';

type PlacementMember = PlacementGroup['blocks'][number];

const found = new Map<PlacementMember, readonly PlacementMismatch[]>();

/** One member's mismatches, computed once for the per-block test and the gap check. */
const memberMismatchesOf = (group: PlacementGroup, member: PlacementMember): readonly PlacementMismatch[] => {
    const cached = found.get(member);
    if (cached !== undefined) return cached;
    const mismatches = placementMismatches(group, member);
    found.set(member, mismatches);
    return mismatches;
};

/** Every member's mismatches for a group. */
const mismatchesOf = (group: PlacementGroup): readonly PlacementMismatch[] =>
    group.blocks.flatMap((member) => memberMismatchesOf(group, member));

describe("placement states against the vectors Java's getStateForPlacement computes", () => {
    it('records every placement in the grid for every block', () => {
        for (const group of placementVectors.blocks) {
            expect(group.state).toHaveLength(placementCount);
            expect(group.placed).toHaveLength(placementCount);
        }
    });

    // One case per block rather than per group: a group such as the signs holds a dozen blocks, each
    // replaying the whole grid, and one case for all of them is too much work for one test.
    describe.each(placementVectors.blocks.map((group) => [group.class, group] as const))('%s', (_name, group) => {
        it.each(group.blocks.map((member) => [member.block, member] as const))(
            'places %s in every recorded context in the state Java does',
            (_block, member) => {
                const unknown = memberMismatchesOf(group, member)
                    .filter((mismatch) => placementGapOf(group, mismatch) === undefined)
                    .map(
                        (mismatch) =>
                            `${mismatch.member.block}, ${describePlacement(mismatch.placement)}: ` +
                            `Java ${mismatch.java}, port ${mismatch.port}`
                    );
                expect(unknown.slice(0, 10), `${unknown.length} placements differ from Java`).toEqual([]);
            }
        );
    });

    it.each(PLACEMENT_GAPS.flatMap((gap) => gap.classes.map((name) => [name, gap.issue] as const)))(
        'still differs from Java for %s, as %s tracks',
        (name) => {
            const groups = placementVectors.blocks.filter((group) => group.class === name);
            const differs = groups.some((group) =>
                mismatchesOf(group).some((mismatch) => placementGapOf(group, mismatch) !== undefined)
            );
            expect(differs, `${name} matches Java now; take it out of PLACEMENT_GAPS`).toBe(true);
        }
    );
});
