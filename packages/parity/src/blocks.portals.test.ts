import {
    bindFamily,
    END_PORTAL,
    END_PORTAL_EYE_STATE,
    END_PORTAL_FACING_STATE,
    END_PORTAL_FRAME_BLOCKS,
    HORIZONTAL_FACES,
    NETHER_PORTAL_BLOCKS,
    NETHER_PORTAL_FRAME_BLOCKS,
    NETHER_PORTAL,
    NETHERRACK,
    OBSIDIAN,
    offset,
    opposite,
    PORTAL_AXIS_STATE,
    PORTAL_LIGHTING_FIRES,
    portalFamily,
    portalInterior
} from '@jsprismarine/block-behaviors';
import type { BlockPosition } from '@jsprismarine/blocks';
import { BLOCK_FACES, PORTAL_BLOCK_NAMES } from '@jsprismarine/blocks';
import { bedrockDimensionOverlay } from '@jsprismarine/mapping';
import { PORTAL_COOLDOWN_TICKS } from '@jsprismarine/prismarine/entity/PortalContact';
import { DIMENSION_TRAVEL, PORTAL_SEARCH_RADIUS, PORTALS } from '@jsprismarine/prismarine/world/portal/rules';
import { VANILLA_DIMENSION_TYPE_JSON } from '@jsprismarine/prismarine/world/vanillaDimensionTypes';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { BlockPaletteCapture } from './goldens.ts';
import { loadBlockPaletteCapture } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { parityCase, reportParityCases } from './trackerCases.ts';

/**
 * The portal note's `blocks.portals` row: every block the portal rules name exists in the
 * Bedrock palette capture, the states those rules read and write are declared on it with the
 * values the rules compare against, and the server's travel tables agree with the dimension
 * mapping and with the Java constants the note quotes.
 *
 * The rules read here are the `@jsprismarine/block-behaviors` portal geometry, the shared
 * portal block list in `@jsprismarine/blocks`, and the `PORTALS` and `DIMENSION_TRAVEL` tables
 * under `packages/prismarine/src/world/portal/rules.ts`. The tables name their blocks through
 * the same block-behaviors constants, so the block list walked here is the union of both: a
 * table entry that drifts to a block the palette lacks, or that links to a dimension type the
 * mapping has no overlay for, fails this row.
 *
 * The numbers come from `docs/research/portals-and-dimension-travel.md`: a 128 block search
 * radius, 80 ticks in a nether portal in survival and 0 in creative, and a 300 tick cooldown
 * for entities against 10 for players. They are repeated in `RESEARCH_NOTE` below so the
 * tables cannot change without this file noticing.
 *
 * Gap ids: `missing-block:<name>` when the capture has no such block, `missing-state:<name>#<state>`
 * when the block carries no such state, `domain:<name>#<state>` when the state's values are
 * not the ones the rules were written against, `unknown-dimension:<id>` when a `links` key or
 * value is not a vanilla dimension type id with a Bedrock overlay, `missing-travel:<id>` when
 * `DIMENSION_TRAVEL` has no entry for a vanilla id, `constant:<name>` when a table value
 * differs from the number the research note quotes, and `command-portal:<case>` when a nether
 * portal a command writes into a frame does not stand.
 *
 * `bedrock-clears-command-portal:<case>` records a decision rather than a fault. The Bedrock
 * Dedicated Server clears a portal a command writes with an axis other than its frame's, and
 * Java keeps it; this server follows Java, and the allow list carries the difference as
 * intentional.
 */

/**
 * The `portal_axis` values Bedrock declares, in palette order. `lightNetherPortal` writes `x` or
 * `z`, `portalAxisOf` reads anything else as `unknown`, which is what a command-placed portal
 * carries, so a fourth value or a renamed one changes what the rules do.
 */
const PORTAL_AXIS_VALUES = ['unknown', 'x', 'z'] as const;

/** The three vanilla Java `dimension_type` ids, the only ones the portal tables may name. */
const VANILLA_DIMENSION_IDS: readonly string[] = Object.keys(VANILLA_DIMENSION_TYPE_JSON);

/**
 * The Java constants `docs/research/portals-and-dimension-travel.md` quotes, by the table
 * value each one has to match.
 */
const RESEARCH_NOTE = {
    /** Bedrock searches 128 blocks in the Overworld and the Nether ("Portal search"). */
    portalSearchRadius: 128,
    /** `players_nether_portal_default_delay` ("Travel timer"). */
    netherPortalSurvivalDelay: 80,
    /** `players_nether_portal_creative_delay` ("Travel timer"). */
    netherPortalCreativeDelay: 0,
    /** `EndPortalBlock` inherits `Portal.getPortalTransitionTime`, which is 0 ("Into the End"). */
    endPortalDelay: 0,
    /** `Entity.getDimensionChangingDelay` ("Cooldown after travel"). */
    entityCooldown: 300,
    /** `Player.getDimensionChangingDelay` and `VehicleEntity.getDimensionChangingDelay` ("Cooldown after travel"). */
    playerCooldown: 10
} as const;

/** A state the rules read on a block, with the exact value set the rules were written against. */
interface ExpectedState {
    readonly block: string;
    readonly state: string;
    /** The values in the order the palette declares them, or in any order when `ordered` is false. */
    readonly values: readonly (string | number | boolean)[];
    readonly ordered: boolean;
}

/**
 * Every block the rules name: lit portals, frames, the fires that light a frame, the forced
 * platform, and whatever the `PORTALS` table lists as a portal or a frame.
 */
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
            .map((name) => `minecraft:${name}`),
        ...Object.values(PORTALS).flatMap((rule) => [...rule.portal, ...rule.frame])
    ])
];

/**
 * The states the rules read, on every block that carries them. A nether portal block carries
 * the axis `lightNetherPortal` writes; an end portal frame carries the eye bit and the facing
 * `findEndPortalRing` compares. The `PORTALS` table contributes its own portal and frame lists
 * by kind, deduplicated against the block-behaviors constants by block and state.
 */
const expectedStates = (): readonly ExpectedState[] => {
    const byKey = new Map<string, ExpectedState>();
    const add = (expected: ExpectedState): void => {
        byKey.set(`${expected.block}#${expected.state}`, expected);
    };
    const netherPortalStates = (block: string): void => {
        add({ block, state: PORTAL_AXIS_STATE, values: PORTAL_AXIS_VALUES, ordered: true });
    };
    const endFrameStates = (block: string): void => {
        add({ block, state: END_PORTAL_EYE_STATE, values: [false, true], ordered: true });
        // `findEndPortalRing` compares the facing against each horizontal face by name.
        add({ block, state: END_PORTAL_FACING_STATE, values: HORIZONTAL_FACES, ordered: false });
    };

    for (const block of NETHER_PORTAL_BLOCKS) netherPortalStates(block);
    for (const block of END_PORTAL_FRAME_BLOCKS) endFrameStates(block);
    for (const rule of Object.values(PORTALS)) {
        if (rule.kind === 'nether') for (const block of rule.portal) netherPortalStates(block);
        if (rule.kind === 'end') for (const block of rule.frame) endFrameStates(block);
    }

    return [...byKey.values()];
};

const sameValues = (declared: readonly (string | number | boolean)[], expected: ExpectedState): boolean => {
    const left = expected.ordered ? declared : [...declared].sort();
    const right = expected.ordered ? expected.values : [...expected.values].sort();
    return JSON.stringify(left) === JSON.stringify(right);
};

/** Every dimension type id the `PORTALS` links name, as a key or a value, deduplicated. */
const linkedDimensionIds = (): readonly string[] => [
    ...new Set(Object.values(PORTALS).flatMap((rule) => Object.entries(rule.links).flat()))
];

/** Which `links` ids are not a vanilla dimension type with a Bedrock overlay. */
const compareLinks = (): { gaps: string[]; links: number; cases: ReturnType<typeof parityCase>[] } => {
    const gaps: string[] = [];
    const ids = linkedDimensionIds();
    const cases = ids.map((id) => {
        const matched = VANILLA_DIMENSION_IDS.includes(id) && bedrockDimensionOverlay(id) !== undefined;
        return parityCase(`dimension-link:${id}`, id, 'Portal dimension link', matched);
    });
    for (const id of ids) {
        if (!VANILLA_DIMENSION_IDS.includes(id) || bedrockDimensionOverlay(id) === undefined) {
            gaps.push(`unknown-dimension:${id}`);
        }
    }
    return { gaps, links: ids.length, cases };
};

/** Which vanilla dimension types `DIMENSION_TRAVEL` has no rule for. */
const compareTravelRules = (): { gaps: string[]; travelRules: number; cases: ReturnType<typeof parityCase>[] } => {
    const gaps: string[] = [];
    const cases = VANILLA_DIMENSION_IDS.map((id) =>
        parityCase(`travel-rule:${id}`, id, 'Portal dimension travel rule', DIMENSION_TRAVEL[id] !== undefined)
    );
    for (const id of VANILLA_DIMENSION_IDS) {
        if (DIMENSION_TRAVEL[id] === undefined) gaps.push(`missing-travel:${id}`);
    }
    return { gaps, travelRules: Object.keys(DIMENSION_TRAVEL).length, cases };
};

/** Which table values differ from the numbers the research note quotes. */
const compareConstants = (): {
    gaps: string[];
    constants: number;
    detail: string[];
    cases: ReturnType<typeof parityCase>[];
} => {
    const gaps: string[] = [];
    const detail: string[] = [];
    const checks: readonly { readonly name: string; readonly table: number | undefined; readonly note: number }[] = [
        { name: 'PORTAL_SEARCH_RADIUS', table: PORTAL_SEARCH_RADIUS, note: RESEARCH_NOTE.portalSearchRadius },
        ...Object.entries(DIMENSION_TRAVEL)
            .filter(([, rule]) => rule.allowsNetherPortal)
            .map(([id, rule]) => ({
                name: `DIMENSION_TRAVEL[${id}].portalSearchRadius`,
                table: rule.portalSearchRadius,
                note: RESEARCH_NOTE.portalSearchRadius
            })),
        ...Object.entries(PORTALS).flatMap(([block, rule]) => [
            {
                name: `PORTALS[${block}].delayTicks.survival`,
                table: rule.delayTicks.survival,
                note: rule.kind === 'nether' ? RESEARCH_NOTE.netherPortalSurvivalDelay : RESEARCH_NOTE.endPortalDelay
            },
            {
                name: `PORTALS[${block}].delayTicks.creative`,
                table: rule.delayTicks.creative,
                note: rule.kind === 'nether' ? RESEARCH_NOTE.netherPortalCreativeDelay : RESEARCH_NOTE.endPortalDelay
            }
        ]),
        {
            name: 'PORTAL_COOLDOWN_TICKS.entity',
            table: PORTAL_COOLDOWN_TICKS.entity,
            note: RESEARCH_NOTE.entityCooldown
        },
        {
            name: 'PORTAL_COOLDOWN_TICKS.player',
            table: PORTAL_COOLDOWN_TICKS.player,
            note: RESEARCH_NOTE.playerCooldown
        }
    ];

    for (const check of checks) {
        if (check.table === check.note) continue;
        gaps.push(`constant:${check.name}`);
        detail.push(`${check.name}: table ${String(check.table)}, research note ${check.note}`);
    }

    const cases = checks.map((check) =>
        parityCase(`constant:${check.name}`, check.name, 'Java portal behavior constant', check.table === check.note)
    );

    return { gaps, constants: checks.length, detail, cases };
};

const comparePortalBlocks = (
    capture: BlockPaletteCapture
): { gaps: string[]; blocks: number; states: number; detail: string[]; cases: ReturnType<typeof parityCase>[] } => {
    const gaps: string[] = [];
    const detail: string[] = [];
    const blocks = portalBlocks();
    const states = expectedStates();
    const cases = blocks.map((block) =>
        parityCase(`block:${block}`, block, 'Bedrock portal block palette', capture.states[block] !== undefined)
    );

    for (const block of blocks) {
        if (capture.states[block] === undefined) gaps.push(`missing-block:${block}`);
    }

    for (const expected of states) {
        const declared = capture.states[expected.block];
        const domain = capture.domains[expected.block]?.[expected.state]?.values ?? [];
        const matched = declared !== undefined && expected.state in declared && sameValues(domain, expected);
        cases.push(
            parityCase(
                `state:${expected.block}#${expected.state}`,
                `${expected.block} · ${expected.state}`,
                'Bedrock portal block state',
                matched
            )
        );
        if (declared === undefined) continue;
        if (!(expected.state in declared)) {
            gaps.push(`missing-state:${expected.block}#${expected.state}`);
            continue;
        }
        if (sameValues(domain, expected)) continue;
        gaps.push(`domain:${expected.block}#${expected.state}`);
        detail.push(
            `${expected.block} ${expected.state}: palette ${JSON.stringify(domain)}, rules ${JSON.stringify(expected.values)}`
        );
    }

    return { gaps, blocks: blocks.length, states: states.length, detail, cases };
};

/** The two axes a nether portal frame can stand on. */
const FRAME_AXES = ['x', 'z'] as const;

/**
 * Writes a 2 by 3 frame and its interior the way `/fill` does, one block at a time with each
 * write telling its neighbors, and reports whether every interior block is still a portal.
 *
 * Java's `FillCommand` places each block through `BlockInput.place`, which runs
 * `Block.updateFromNeighbourShapes` and keeps the written state when that returns air, so a
 * portal block whose axis runs across its frame stands. The neighbors it tells are the portal
 * blocks written before it, which agree with it, and the air beside the frame never changes.
 * @javaSee BlockInput.place
 */
const commandPortalStands = (frameAxis: (typeof FRAME_AXES)[number], portalAxis: string): boolean => {
    const harness = bindFamily(portalFamily, NETHER_PORTAL);
    const frame = { bottomLeft: { x: 0, y: 64, z: 0 }, axis: frameAxis, width: 2, height: 3 };
    const along = (position: BlockPosition, distance: number): BlockPosition =>
        frameAxis === 'x' ? { ...position, x: position.x + distance } : { ...position, z: position.z + distance };
    const write = (position: BlockPosition, identifier: string, states: Record<string, string> = {}): void => {
        harness.dimension.set(position, identifier, states);
        for (const face of BLOCK_FACES) {
            const neighbor = offset(position, face);
            if (harness.dimension.identifierAt(neighbor) === NETHER_PORTAL)
                harness.neighborChanged(neighbor, opposite(face));
        }
    };

    for (let a = -1; a <= frame.width; a += 1) {
        for (let dy = -1; dy <= frame.height; dy += 1) {
            const side = a === -1 || a === frame.width;
            const end = dy === -1 || dy === frame.height;
            if (side || end) write({ ...along(frame.bottomLeft, a), y: frame.bottomLeft.y + dy }, OBSIDIAN);
        }
    }
    const interior = portalInterior(frame);
    for (const position of interior) write(position, NETHER_PORTAL, { [PORTAL_AXIS_STATE]: portalAxis });
    return interior.every((position) => harness.dimension.identifierAt(position) === NETHER_PORTAL);
};

/**
 * Whether a portal a command writes into a frame stands, for every frame axis and every axis the
 * palette declares: the Java result, and the Bedrock Dedicated Server's difference as its own gap.
 */
const compareCommandPortals = (): { gaps: string[]; cases: ReturnType<typeof parityCase>[] } => {
    const gaps: string[] = [];
    const cases = FRAME_AXES.flatMap((frameAxis) =>
        PORTAL_AXIS_VALUES.map((portalAxis) => {
            const id = `frame-${frameAxis}:axis-${portalAxis}`;
            const stands = commandPortalStands(frameAxis, portalAxis);
            if (!stands) gaps.push(`command-portal:${id}`);
            // The Bedrock Dedicated Server keeps only the portal whose axis matches its frame.
            if (stands && portalAxis !== frameAxis) gaps.push(`bedrock-clears-command-portal:${id}`);
            return parityCase(`command-portal:${id}`, id, 'Nether portal written by a command', stands);
        })
    );
    return { gaps, cases };
};

describeFamily(FAMILIES.blocksPortals, [REFERENCES.bedrockBlockPalette], () => {
    const capture = loadBlockPaletteCapture();
    const portalBlockComparison = comparePortalBlocks(capture);
    const { gaps: blockGaps, blocks, states, detail: blockDetail } = portalBlockComparison;
    const linkComparison = compareLinks();
    const travelComparison = compareTravelRules();
    const constantComparison = compareConstants();
    const commandPortalComparison = compareCommandPortals();
    const { gaps: linkGaps, links } = linkComparison;
    const { gaps: travelGaps, travelRules } = travelComparison;
    const { gaps: constantGaps, constants, detail: constantDetail } = constantComparison;
    const verdict = checkAllowList(FAMILIES.blocksPortals, [
        ...blockGaps,
        ...linkGaps,
        ...travelGaps,
        ...constantGaps,
        ...commandPortalComparison.gaps
    ]);
    reportParityCases(FAMILIES.blocksPortals, import.meta.filename, [
        ...portalBlockComparison.cases,
        ...linkComparison.cases,
        ...travelComparison.cases,
        ...constantComparison.cases,
        ...commandPortalComparison.cases
    ]);
    const unexpected = (prefix: string): string[] => verdict.unexpected.filter((gap) => gap.startsWith(prefix));

    it('finds every portal, frame, fire and platform block the rules name in the palette capture', () => {
        expect(unexpected('missing-block:')).toEqual([]);
    });

    it('finds the states the rules read, with the values the rules compare against', () => {
        expect([...unexpected('missing-state:'), ...unexpected('domain:')], blockDetail.join('\n')).toEqual([]);
    });

    it('links every portal between vanilla dimension types the Bedrock overlay knows', () => {
        expect(unexpected('unknown-dimension:')).toEqual([]);
        expect(links).toBe(VANILLA_DIMENSION_IDS.length);
    });

    it('has a travel rule for each vanilla dimension type', () => {
        expect(unexpected('missing-travel:')).toEqual([]);
    });

    it('matches the Java constants the research note quotes', () => {
        expect(unexpected('constant:'), constantDetail.join('\n')).toEqual([]);
    });

    it('keeps a portal a command writes into a frame, whatever its axis, as Java does', () => {
        expect(unexpected('command-portal:')).toEqual([]);
    });

    it('records each portal the Bedrock Dedicated Server would clear as an intentional difference', () => {
        expect(unexpected('bedrock-clears-command-portal:')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports how many blocks, states, links, travel rules and constants the row walks', () => {
        reportParityProgress(FAMILIES.blocksPortals, {
            blocks,
            states,
            links,
            travelRules,
            constants,
            paletteBlocks: Object.keys(capture.states).length
        });
        expect(blocks).toBeGreaterThan(0);
        expect(states).toBeGreaterThan(0);
        expect(constants).toBeGreaterThan(0);
    });
});
