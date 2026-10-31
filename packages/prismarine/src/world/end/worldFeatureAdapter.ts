/**
 * A `FeatureWorld` over a live, loaded `World`, for the blocks the dragon fight places.
 *
 * World generation decorates chunks through `GenerationRegion.featureWorld()` long before a
 * world exists. The fight is the one caller that places features into a running world instead:
 * the exit podium on the first scan, and later the gateway and re-placed spikes. This adapter
 * is scoped to those features: they write Java states and read almost nothing back, so the
 * block oracle answers from the state names alone and the biome is the End's.
 */
import type { BlockOracle, BlockPos, FeatureWorld, BlockState as JavaBlockState } from '@jsprismarine/features';
import { blockState } from '@jsprismarine/features';
import { bedrockBlockStateToJava } from '@jsprismarine/mapping';
import { UNKNOWN_RUNTIME_ID } from '@jsprismarine/protocol';

import { JavaStateTranslator } from '../generators/datadriven/javaTranslation';
import { bedrockEntityIdentifierOf } from '../../entity/identifierMapping';
import type { World } from '../World';

const JAVA_AIR: JavaBlockState = blockState('minecraft:air');

/**
 * Answers the oracle's questions from the state name alone.
 *
 * Enough for the End fight's features - podium, gateway, spike - which never ask about tags,
 * fluids or survival. A feature that needs real answers belongs in the generator's oracle, not
 * here.
 */
const endBlockOracle: BlockOracle = {
    isAir: (state) => state.name === 'minecraft:air',
    isSolid: (state) => state.name !== 'minecraft:air',
    isSturdy: (state) => state.name !== 'minecraft:air',
    isReplaceable: (state) => state.name === 'minecraft:air',
    fluid: (state) => (state.name === 'minecraft:water' ? 'water' : state.name === 'minecraft:lava' ? 'lava' : 'empty'),
    hasTag: () => false,
    canSurvive: () => true
};

/** The first y above the topmost non-air block of one loaded column, or `minY` for a void one. */
const firstFreeYAbove = (world: World, x: number, z: number): number => {
    for (let y = world.topOfColumn(x, z) - 1; y >= world.getDimension().minY; y -= 1) {
        if (world.loadedBlockAt(x, y, z)?.name !== 'minecraft:air') return y + 1;
    }
    return world.getDimension().minY;
};

/**
 * The world as the End fight's features write into it.
 *
 * Writes go through {@link World.setLoadedBlockRuntimeId}, the same write every block change
 * takes, so clients hear about each block and physics reacts; a write into an unloaded chunk is
 * declined, as Java's `WorldGenLevel.setBlock` declines one outside its region. The caller
 * loads the chunks a feature spans before placing it. Every heightmap kind answers the plain
 * top-of-column, which is exact for the fight's features: nothing in the End arena
 * distinguishes `MOTION_BLOCKING` from `WORLD_SURFACE`.
 */
export const fightFeatureWorld = (world: World): FeatureWorld => {
    const translator = new JavaStateTranslator();
    const dimension = world.getDimension();

    return {
        minY: dimension.minY,
        height: dimension.height,
        seaLevel: world.getSeaLevel(),
        seed: world.getSeed(),
        blocks: endBlockOracle,
        getBlock: (position: BlockPos): JavaBlockState => {
            const stored = world.loadedBlockAt(position.x, position.y, position.z);
            if (stored === undefined) return JAVA_AIR;

            const mapped = bedrockBlockStateToJava(stored.name, stored.states);
            return mapped.kind === 'mapped' ? blockState(mapped.java.name, mapped.java.properties) : JAVA_AIR;
        },
        setBlock: (position: BlockPos, state: JavaBlockState): boolean => {
            const runtimeId = translator.runtimeIdOf(state.name, state.properties);
            if (runtimeId === UNKNOWN_RUNTIME_ID) return false;

            return world.setLoadedBlockRuntimeId(position.x, position.y, position.z, runtimeId);
        },
        spawnEntity: (identifier, position, options) => {
            const content = world.getServer().getContent();
            const bedrockIdentifier = bedrockEntityIdentifierOf(identifier, (candidate) =>
                content.entities.registry.has(candidate)
            );
            if (bedrockIdentifier === undefined) return;

            world.dataEntities().runtime.spawn(bedrockIdentifier, position, options);
        },
        getHeight: (_heightmap, x, z) => firstFreeYAbove(world, x, z),
        getBiome: () => 'minecraft:the_end'
    };
};
