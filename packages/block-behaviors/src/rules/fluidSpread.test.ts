import type { BlockFace, BlockPosition, HookBlock, LiquidReaction } from '@jsprismarine/blocks';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { describe, expect, it } from 'vitest';

import vectors from '../../vectors/26.3/fluid-spread.json' with { type: 'json' };
import { offset } from '../geometry';
import type { HorizontalFace } from '../geometry';
import { createVoxelWorld, OVERWORLD } from '../voxelWorld';
import type { BlockStates } from '../world';
import { liquidStateOf, NETHER, spreadLiquid } from './fluid';
import type { LiquidState } from './fluid';

/** What a host knows about one Java block state, as the dumper recorded it from the jar. */
interface StateFacts {
    /** Whether its collision shape is `Shapes.block()`. */
    readonly fullCube: boolean;
    /** What its `isSolid` answers. */
    readonly solid: boolean;
    /** Whether it is in `minecraft:washed_away_by_fluids`. */
    readonly washedAway: boolean;
    /** Whether its block is a `LiquidBlockContainer`. */
    readonly holdsWater: boolean;
}

/** One layout and the fluid states Java's `FlowingFluid.getSpread` answered for its origin. */
interface SpreadCase {
    readonly name: string;
    readonly dimension: string;
    readonly origin: readonly number[];
    readonly blocks: readonly {
        readonly from: readonly number[];
        readonly to: readonly number[];
        readonly state: string;
    }[];
    readonly spread: Readonly<Partial<Record<HorizontalFace, { readonly kind: string } & Omit<LiquidState, 'kind'>>>>;
}

const states: Readonly<Record<string, StateFacts>> = vectors.states;
const cases: readonly SpreadCase[] = vectors.cases;
const occluding = new Set(vectors.occludingFaces.map(({ from, to, face }) => `${from}|${to}|${face}`));

const keyOf = (at: BlockPosition): string => `${at.x},${at.y},${at.z}`;
const positionOf = ([x = 0, y = 0, z = 0]: readonly number[]): BlockPosition => ({ x, y, z });

/** Splits a serialized Java block state, such as `minecraft:water[level=3]`, into its parts. */
const parseJavaState = (state: string): { readonly name: string; readonly properties: Record<string, string> } => {
    const open = state.indexOf('[');
    if (open < 0) return { name: state, properties: {} };
    const properties: Record<string, string> = {};
    for (const pair of state.slice(open + 1, -1).split(',')) {
        const [property = '', value = ''] = pair.split('=');
        properties[property] = value;
    }
    return { name: state.slice(0, open), properties };
};

/**
 * The case's layout in a voxel world, each Java state mapped to its Bedrock block and a
 * waterlogged state's water put in the second layer, with a host that answers the port's shape
 * and tag questions from what Java recorded for each state.
 */
const layoutWorld = (spreadCase: SpreadCase) => {
    const dimension = createVoxelWorld().at(spreadCase.dimension === 'nether' ? NETHER : OVERWORLD);
    const javaStates = new Map<string, string>();
    for (const { from, to, state } of spreadCase.blocks) {
        const { name, properties } = parseJavaState(state);
        const mapped = javaBlockStateToBedrock(name, properties);
        if (mapped.kind !== 'mapped') throw new TypeError(`${state} has no Bedrock state`);
        const [fromX = 0, fromY = 0, fromZ = 0] = from;
        const [toX = 0, toY = 0, toZ = 0] = to;
        for (let x = fromX; x <= toX; x++) {
            for (let y = fromY; y <= toY; y++) {
                for (let z = fromZ; z <= toZ; z++) {
                    const at = { x, y, z };
                    dimension.set(at, mapped.bedrock.name, mapped.bedrock.states);
                    dimension.setLiquid(at, 'minecraft:air');
                    if (properties.waterlogged === 'true') dimension.setLiquid(at, 'minecraft:water');
                    javaStates.set(keyOf(at), state);
                }
            }
        }
    }

    const javaStateAt = (block: HookBlock): string => javaStates.get(keyOf(block.position)) ?? 'minecraft:air';
    const factsOf = (block: HookBlock): StateFacts => {
        const facts = states[javaStateAt(block)];
        if (facts === undefined) throw new TypeError(`the vectors record no facts for ${javaStateAt(block)}`);
        return facts;
    };

    // The first fluid written at each position, which is the state the spread chose for it.
    const writes = new Map<string, LiquidState | undefined>();
    const record = (at: BlockPosition, identifier: string, blockStates: BlockStates = {}): void => {
        if (!writes.has(keyOf(at))) writes.set(keyOf(at), liquidStateOf({ identifier, states: blockStates }));
    };
    const setBlock = dimension.setBlock.bind(dimension);
    const setLiquid = dimension.setLiquid.bind(dimension);
    const world = Object.assign(dimension, {
        isFullCube: (block: HookBlock) => factsOf(block).fullCube,
        isSolid: (block: HookBlock) => factsOf(block).solid,
        liquidReactionOf: (block: HookBlock): LiquidReaction => (factsOf(block).washedAway ? 'popped' : 'blocking'),
        holdsWater: (block: HookBlock) => factsOf(block).holdsWater,
        faceOccludes: (block: HookBlock, neighbor: HookBlock, face: BlockFace) =>
            occluding.has(`${javaStateAt(block)}|${javaStateAt(neighbor)}|${face}`),
        setBlock: (at: BlockPosition, identifier: string, blockStates?: BlockStates) => {
            record(at, identifier, blockStates);
            setBlock(at, identifier, blockStates);
        },
        setLiquid: (at: BlockPosition, identifier: string, blockStates?: BlockStates) => {
            record(at, identifier, blockStates);
            setLiquid(at, identifier, blockStates);
        }
    });
    return { world, writes };
};

describe("fluid spread against Java's FlowingFluid.getSpread", () => {
    it.each(cases)('$name', (spreadCase) => {
        const { world, writes } = layoutWorld(spreadCase);
        const origin = positionOf(spreadCase.origin);
        // A waterlogged origin's water is the second layer's, which is the block the host ticks.
        const ticked = world.getLiquid(origin) ?? world.block(origin);

        const result = spreadLiquid(world, ticked);

        expect(result.down).toBe(false);
        const spread = Object.fromEntries(result.sides.map((side) => [side, writes.get(keyOf(offset(origin, side)))]));
        expect(spread).toEqual(spreadCase.spread);
        // Nothing but the spread wrote a fluid: the origin kept its state and no reaction fired.
        expect(writes.size).toBe(result.sides.length);
    });
});
