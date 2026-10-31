import type { BlockStateValue } from '@jsprismarine/blocks';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type { ServerContent } from '../../../content/ServerContent';
import type { GeneratorLogger } from '../../BaseGenerator';
import Chunk from '../../chunk/Chunk';
import { maxSubChunk, maxY, minSubChunk } from '../../Dimension';
import type { DimensionType } from '../../Dimension';
import type { Generator, SurfaceProbe } from '../../Generator';
import type { GeneratorFactory } from '../../GeneratorFactories';
import { bedrockBiomeIdOf } from '../datadriven/javaTranslation';

/** The kind id of Java's debug world, the grid of every block state. */
export const DEBUG_GENERATOR_KIND = 'minecraft:debug';

/** The y every grid block sits at, Java's `DebugLevelSource.HEIGHT`. */
export const DEBUG_GRID_Y = 70;

/** The y of the barrier floor under the grid, Java's `DebugLevelSource.BARRIER_HEIGHT`. */
export const DEBUG_FLOOR_Y = 60;

/** The distance between grid cells, Java's `BLOCK_MARGIN`: a block, then a gap. */
const BLOCK_MARGIN = 2;

/** The block the grid stands on. */
const FLOOR_BLOCK = 'minecraft:barrier';

/** The biome of the whole world, Java's fixed `minecraft:plains`. */
const DEBUG_BIOME = 'minecraft:plains';

/** How many unresolvable states a warning names before it counts the rest. */
const NAMED_IN_WARNING = 5;

/** One cell of the grid: a block identifier and the values of every property it carries. */
export interface DebugGridState {
    readonly name: string;
    readonly values: Readonly<Record<string, BlockStateValue>>;
}

/**
 * The block states the debug grid shows, in the order it shows them.
 *
 * Java walks `BuiltInRegistries.BLOCK` in registry order and lists each block's possible
 * states. The Bedrock counterpart is the content palette: every block definition the pack
 * stack loaded, in `content.blocks.states` order, which is runtime id order. That order is
 * the identifiers sorted, then each block's states by canonical index, so the cell at grid
 * index `i` shows the palette's runtime id `i`. A block the palette has but the state
 * catalog does not know is still listed, so the indices stay aligned with the palette.
 */
export const debugGridStates = (content: ServerContent): readonly DebugGridState[] =>
    content.blocks.states.map((state) => ({ name: state.type.identifier, values: state.values }));

/** How a {@link DebugGenerator} is built. */
export interface DebugGeneratorOptions {
    /**
     * The states to lay out, read once at the first chunk. The factory passes the content
     * palette through {@link debugGridStates}; a test may pass any list.
     */
    readonly states: () => readonly DebugGridState[];
    /** The dimension the chunks belong to. The floor and the grid must fit inside its bounds. */
    readonly dimension: DimensionType;
    readonly logger?: GeneratorLogger;
}

/** The grid once its states are resolved to the ids a chunk stores. */
interface DebugGrid {
    /** The chunk runtime id per state, or null for a state the catalog refuses. */
    readonly ids: readonly (number | null)[];
    readonly states: readonly DebugGridState[];
    /** `ceil(sqrt(count))`, Java's `GRID_WIDTH`. */
    readonly width: number;
    /** `ceil(count / width)`, Java's `GRID_HEIGHT`. */
    readonly height: number;
}

/**
 * Java's `DebugLevelSource`: every block state on a grid at y {@link DEBUG_GRID_Y}, one every
 * {@link BLOCK_MARGIN} blocks on both axes, over a barrier floor at y {@link DEBUG_FLOOR_Y}.
 *
 * The layout is Java's `getBlockStateFor`, read from the 26.3 server jar. A cell exists at
 * every positive odd `x` and `z`; the state index is `(x / 2) * width + z / 2`, where `x / 2`
 * and `z / 2` are integer halves, `width` is `ceil(sqrt(count))`, and halves past the width
 * or past `ceil(count / width)` are empty. The grid grows along z fastest, so the first
 * `width` states stand in one row along z at x 1. Everything else in the world is air in
 * plains.
 *
 * Java's bounds compare is inclusive, so the row at `z / 2 == height` is kept and its index
 * `(x / 2) * width + height` lands on the next column's first cells whenever `height` equals
 * `width`. That row repeats those states in Java too, and it is kept here so the two worlds
 * read the same.
 *
 * The seed is ignored. A state the block state catalog has no schema for cannot be given a
 * runtime id and generates as air; the generator says so once, because a hole in this grid
 * is a palette mismatch somebody wants to see.
 */
export class DebugGenerator implements Generator {
    private readonly dimension: DimensionType;
    private readonly logger: GeneratorLogger | undefined;
    private readonly readStates: () => readonly DebugGridState[];
    private readonly floorId: number;
    private grid: DebugGrid | undefined;

    public constructor(options: DebugGeneratorOptions) {
        this.dimension = options.dimension;
        this.logger = options.logger;
        this.readStates = options.states;
        this.floorId = BlockRuntimeIds.getByName(FLOOR_BLOCK);
    }

    /** @inheritDoc */
    public async generateChunk(cx: number, cz: number): Promise<Chunk> {
        const chunk = new Chunk(cx, cz, undefined, this.dimension);
        const grid = this.gridOf();

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                chunk.setBlockRuntimeId(x, DEBUG_FLOOR_Y, z, this.floorId);

                const index = stateIndexAt(grid, cx * 16 + x, cz * 16 + z);
                if (index === undefined) continue;
                const id = grid.ids[index];
                if (id !== null && id !== undefined) chunk.setBlockRuntimeId(x, DEBUG_GRID_Y, z, id);
            }
        }

        const biome = bedrockBiomeIdOf(DEBUG_BIOME);
        for (let section = minSubChunk(this.dimension); section <= maxSubChunk(this.dimension); section++) {
            chunk.getBiomes().fillSection(section, biome);
        }

        return chunk;
    }

    /** @inheritDoc */
    public surfaceAt(x: number, z: number): SurfaceProbe {
        const grid = this.gridOf();
        const index = stateIndexAt(grid, x, z);
        if (index !== undefined && grid.ids[index] !== null) {
            return { y: DEBUG_GRID_Y, name: grid.states[index]!.name };
        }

        return { y: DEBUG_FLOOR_Y, name: FLOOR_BLOCK };
    }

    private gridOf(): DebugGrid {
        if (this.grid !== undefined) return this.grid;

        const states = this.readStates();
        const unresolved: string[] = [];
        const ids = states.map((state) => {
            const id = BlockRuntimeIds.tryGetByState(state.name, state.values);
            if (id === null) unresolved.push(describe(state));
            return id;
        });

        if (unresolved.length > 0) {
            const named = unresolved.slice(0, NAMED_IN_WARNING).join(', ');
            const rest = unresolved.length - NAMED_IN_WARNING;
            this.logger?.warn(
                `${unresolved.length} of ${states.length} palette states have no block state schema and generate as air: ${named}${rest > 0 ? ` and ${rest} more` : ''}`
            );
        }

        // Java computes both in float; the counts in question are far below where that differs.
        const width = Math.ceil(Math.sqrt(states.length));
        const height = width === 0 ? 0 : Math.ceil(states.length / width);
        this.grid = { ids, states, width, height };
        return this.grid;
    }
}

/**
 * Java's `getBlockStateFor`: which state, if any, stands at a block column.
 *
 * @returns The index into the grid's states, or undefined where the column holds no cell.
 */
const stateIndexAt = (grid: DebugGrid, x: number, z: number): number | undefined => {
    if (x <= 0 || z <= 0 || x % BLOCK_MARGIN === 0 || z % BLOCK_MARGIN === 0) return undefined;

    const column = Math.floor(x / BLOCK_MARGIN);
    const row = Math.floor(z / BLOCK_MARGIN);
    if (column > grid.width || row > grid.height) return undefined;

    const index = column * grid.width + row;
    return index < grid.states.length ? index : undefined;
};

/** A state as the warning spells it: `minecraft:oak_log[pillar_axis=x]`. */
const describe = (state: DebugGridState): string => {
    const keys = Object.keys(state.values).sort();
    if (keys.length === 0) return state.name;
    return `${state.name}[${keys.map((key) => `${key}=${String(state.values[key])}`).join(',')}]`;
};

/**
 * The `minecraft:debug` kind: the content palette laid out as Java's debug world, for
 * checking the palette and the block mapping by eye.
 *
 * @throws {Error} When the dimension's bounds leave no room for the floor at y 60 and the grid
 *   at y 70, since Java's layout has no other place to put them.
 */
export const debugGeneratorFactory: GeneratorFactory = {
    kind: DEBUG_GENERATOR_KIND,
    build(context) {
        const dimension = context.dimension;
        if (DEBUG_FLOOR_Y < dimension.minY || DEBUG_GRID_Y > maxY(dimension)) {
            throw new Error(
                `${DEBUG_GENERATOR_KIND} lays its grid at y ${DEBUG_FLOOR_Y} to ${DEBUG_GRID_Y}, outside the ${dimension.id} stem's y ${dimension.minY} to ${maxY(dimension)}`
            );
        }

        return new DebugGenerator({
            states: () => debugGridStates(context.content()),
            dimension,
            logger: context.logger
        });
    }
};
