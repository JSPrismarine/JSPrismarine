import {
    END_PORTAL,
    END_PORTAL_EYE_STATE,
    END_PORTAL_FACING_STATE,
    END_PORTAL_FRAME_BLOCKS,
    HORIZONTAL_FACES,
    NETHER_PORTAL_BLOCKS,
    NETHER_PORTAL_FRAME_BLOCKS,
    NETHERRACK,
    PORTAL_AXIS_STATE,
    PORTAL_LIGHTING_FIRES
} from '@jsprismarine/block-behaviors';
import { PORTAL_BLOCK_NAMES } from '@jsprismarine/blocks';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { BlockPaletteCapture } from './goldens.ts';
import { loadBlockPaletteCapture } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

/**
 * The portal note's `blocks.portals` row: every block the portal rules name exists in the
 * Bedrock palette capture, and the states those rules read and write are declared on it with
 * the values the rules compare against.
 *
 * The rules read here are the `@jsprismarine/block-behaviors` portal geometry and the shared
 * portal block list in `@jsprismarine/blocks`. The server's `PORTALS` and `DIMENSION_TRAVEL`
 * tables under `packages/prismarine/src/world/portal/rules.ts` are not on this branch yet; the
 * chunk that lands them can widen the block list this row walks.
 *
 * Gap ids: `missing-block:<name>` when the capture has no such block, `missing-state:<name>#<state>`
 * when the block carries no such state, and `domain:<name>#<state>` when the state's values are
 * not the ones the rules were written against.
 */

/**
 * The `portal_axis` values Bedrock declares, in palette order. `lightNetherPortal` writes `x` or
 * `z`, `portalAxisOf` reads anything else as `unknown`, which is what a command-placed portal
 * carries, so a fourth value or a renamed one changes what the rules do.
 */
const PORTAL_AXIS_VALUES = ['unknown', 'x', 'z'] as const;

/** A state the rules read on a block, with the exact value set the rules were written against. */
interface ExpectedState {
    readonly block: string;
    readonly state: string;
    /** The values in the order the palette declares them, or in any order when `ordered` is false. */
    readonly values: readonly (string | number | boolean)[];
    readonly ordered: boolean;
}

/** Every block the rules name: lit portals, frames, the fires that light a frame, and the forced platform. */
const portalBlocks = (): readonly string[] => [
    ...new Set([
        ...NETHER_PORTAL_BLOCKS,
        ...NETHER_PORTAL_FRAME_BLOCKS,
        END_PORTAL,
        ...END_PORTAL_FRAME_BLOCKS,
        ...PORTAL_LIGHTING_FIRES,
        NETHERRACK,
        ...Object.values(PORTAL_BLOCK_NAMES)
            .flat()
            .map((name) => `minecraft:${name}`)
    ])
];

/** The states the rules read, on every block that carries them. */
const expectedStates = (): readonly ExpectedState[] => [
    ...NETHER_PORTAL_BLOCKS.map((block) => ({
        block,
        state: PORTAL_AXIS_STATE,
        values: PORTAL_AXIS_VALUES,
        ordered: true
    })),
    ...END_PORTAL_FRAME_BLOCKS.flatMap((block) => [
        { block, state: END_PORTAL_EYE_STATE, values: [false, true], ordered: true },
        // `findEndPortalRing` compares the facing against each horizontal face by name.
        { block, state: END_PORTAL_FACING_STATE, values: HORIZONTAL_FACES, ordered: false }
    ])
];

const sameValues = (declared: readonly (string | number | boolean)[], expected: ExpectedState): boolean => {
    const left = expected.ordered ? declared : [...declared].sort();
    const right = expected.ordered ? expected.values : [...expected.values].sort();
    return JSON.stringify(left) === JSON.stringify(right);
};

const comparePortalBlocks = (
    capture: BlockPaletteCapture
): { gaps: string[]; blocks: number; states: number; detail: string[] } => {
    const gaps: string[] = [];
    const detail: string[] = [];
    const blocks = portalBlocks();
    const states = expectedStates();

    for (const block of blocks) {
        if (capture.states[block] === undefined) gaps.push(`missing-block:${block}`);
    }

    for (const expected of states) {
        const declared = capture.states[expected.block];
        if (declared === undefined) continue;
        if (!(expected.state in declared)) {
            gaps.push(`missing-state:${expected.block}#${expected.state}`);
            continue;
        }
        const domain = capture.domains[expected.block]?.[expected.state]?.values ?? [];
        if (sameValues(domain, expected)) continue;
        gaps.push(`domain:${expected.block}#${expected.state}`);
        detail.push(
            `${expected.block} ${expected.state}: palette ${JSON.stringify(domain)}, rules ${JSON.stringify(expected.values)}`
        );
    }

    return { gaps, blocks: blocks.length, states: states.length, detail };
};

describeFamily(FAMILIES.blocksPortals, [REFERENCES.bedrockBlockPalette], () => {
    const capture = loadBlockPaletteCapture();
    const { gaps, blocks, states, detail } = comparePortalBlocks(capture);
    const verdict = checkAllowList(FAMILIES.blocksPortals, gaps);

    it('finds every portal, frame, fire and platform block the rules name in the palette capture', () => {
        expect(verdict.unexpected.filter((gap) => gap.startsWith('missing-block:'))).toEqual([]);
    });

    it('finds the states the rules read, with the values the rules compare against', () => {
        expect(
            verdict.unexpected.filter((gap) => !gap.startsWith('missing-block:')),
            detail.join('\n')
        ).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports how many blocks and states the row walks', () => {
        reportParityProgress(FAMILIES.blocksPortals, {
            blocks,
            states,
            paletteBlocks: Object.keys(capture.states).length
        });
        expect(blocks).toBeGreaterThan(0);
        expect(states).toBeGreaterThan(0);
    });
});
