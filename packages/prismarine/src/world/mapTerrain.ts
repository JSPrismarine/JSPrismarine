/**
 * The columns of a world as a map reads them: the inner loop of Java 26.3's `MapItem.update`.
 *
 * A column is read from the top of its highest block down to the first block with a map color.
 * When that block holds a fluid, the fluid blocks under it are counted as the water's depth, and
 * the column is drawn as the fluid unless the block's top face is sturdy, as Java's
 * `getCorrectStateForFluidBlock` decides: seagrass and a waterlogged stair are drawn as water, a
 * waterlogged full block as itself. Bedrock keeps a waterlogged block's water in the second
 * storage layer, which is read for the fluid.
 */
import { hasSturdyTopFace } from '@jsprismarine/engine-systems';
import { bedrockBlockPropertiesOf, bedrockBlockStateToJava, javaBlockFluidKindOf } from '@jsprismarine/mapping';
import type { JavaBlockFluidKind } from '@jsprismarine/mapping';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../block/state/BlockStateSchema';
import type Chunk from './chunk/Chunk';
import { MapColors, mapColorIdOf } from './mapColors';
import type { MapColumn, MapTerrain } from './mapRender';

/** What a map needs to know of one block state. */
interface MapBlockFacts {
    readonly colorId: number;
    /** The color of the block holding water, which Java changes for the barrier and the light block. */
    readonly waterloggedColorId: number;
    readonly fluid: JavaBlockFluidKind;
    readonly sturdyTop: boolean;
}

/** The color a fluid is drawn with, its legacy block's: water's, and lava's, which is fire. */
const FLUID_COLORS: Readonly<Record<Exclude<JavaBlockFluidKind, 'empty'>, number>> = {
    water: MapColors.water.id,
    lava: MapColors.fire.id
};

/** Java draws a column with nothing in it down to the floor as bedrock. */
const FLOOR_COLOR = mapColorIdOf(bedrockBlockPropertiesOf('minecraft:bedrock')?.mapColor ?? 'none');

const NOTHING: MapBlockFacts = {
    colorId: MapColors.none.id,
    waterloggedColorId: MapColors.none.id,
    fluid: 'empty',
    sturdyTop: false
};

let factsRevision = -1;
const factsByRuntimeId = new Map<number, MapBlockFacts>();

/** The map facts of a runtime id, kept until a plugin registers a block schema. */
const factsOf = (runtimeId: number): MapBlockFacts => {
    const revision = BlockStateSchemas.getRevision();
    if (revision !== factsRevision) {
        factsByRuntimeId.clear();
        factsRevision = revision;
    }
    const cached = factsByRuntimeId.get(runtimeId);
    if (cached !== undefined) return cached;

    const state = BlockRuntimeIds.getState(runtimeId);
    let facts = NOTHING;
    if (state !== null) {
        const mapped = bedrockBlockStateToJava(state.name, state.properties);
        const properties = bedrockBlockPropertiesOf(state.name, state.properties);
        const colorId = mapColorIdOf(properties?.mapColor ?? 'none');
        facts = {
            colorId,
            waterloggedColorId:
                properties?.waterloggedMapColor === undefined ? colorId : mapColorIdOf(properties.waterloggedMapColor),
            fluid: mapped.kind === 'mapped' ? javaBlockFluidKindOf(mapped.java) : 'empty',
            sturdyTop: hasSturdyTopFace({ name: state.name, states: state.properties })
        };
    }
    factsByRuntimeId.set(runtimeId, facts);
    return facts;
};

/** The world a map is drawn from. */
export interface MapWorld {
    getLoadedChunk(chunkX: number, chunkZ: number): Chunk | null;
    getDimension(): { readonly minY: number; readonly java: { readonly hasCeiling: boolean } };
}

/** A world's loaded chunks as a map reads them. */
export const mapTerrainOf = (world: MapWorld): MapTerrain => {
    const dimension = world.getDimension();
    const minY = dimension.minY;
    const chunkOf = (x: number, z: number): Chunk | null => world.getLoadedChunk(x >> 4, z >> 4);

    /** The block at a position with the fluid its second layer holds folded in. */
    const blockAt = (chunk: Chunk, x: number, y: number, z: number): MapBlockFacts => {
        const block = factsOf(chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf));
        if (block.fluid !== 'empty') return block;
        const liquid = factsOf(chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf, 1));
        return liquid.fluid === 'empty' ? block : { ...block, colorId: block.waterloggedColorId, fluid: liquid.fluid };
    };

    const column = (x: number, z: number): MapColumn => {
        const chunk = chunkOf(x, z);
        // `MapItem.update` reads only the loaded chunks it asked `isLoaded` about.
        if (chunk === null) return { colorId: MapColors.none.id, y: minY, waterDepth: 0 };

        // The `WORLD_SURFACE` heightmap: one above the highest block that is not air.
        let columnY = (chunk.getHighestBlockAt(x, z) ?? minY - 1) + 1;
        if (columnY <= minY) return { colorId: FLOOR_COLOR, y: columnY, waterDepth: 0 };

        let block: MapBlockFacts;
        do {
            columnY--;
            block = blockAt(chunk, x, columnY, z);
        } while (block.colorId === MapColors.none.id && columnY > minY);

        let waterDepth = 0;
        let colorId = block.colorId;
        if (columnY > minY && block.fluid !== 'empty') {
            let solidY = columnY - 1;
            let below: MapBlockFacts;
            do {
                below = blockAt(chunk, x, solidY--, z);
                waterDepth++;
            } while (solidY > minY && below.fluid !== 'empty');

            if (!block.sturdyTop) colorId = FLUID_COLORS[block.fluid];
        }
        return { colorId, y: columnY, waterDepth };
    };

    return {
        hasCeiling: dimension.java.hasCeiling,
        isLoaded: (x, z) => chunkOf(x, z) !== null,
        column
    };
};
