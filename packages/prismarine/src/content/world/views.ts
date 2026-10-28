/**
 * The nine world interfaces the content packages declare, projected out of
 * the one {@link ServerWorldAdapter} the server implements.
 *
 * Each projection is thin on purpose. Where a package's member is a rename
 * of an adapter member it is a rename; where the package asks for something
 * only one subsystem can answer, the projection reads the optional adapter
 * group for it and throws {@link NotWiredError} when that group is absent.
 * Nothing here invents a value.
 */
import { DEFAULT_BLOCK_PROPERTIES } from '@jsprismarine/block-behaviors';
import type { BlockWorld, WorldActions as BlockWorldActions, WorldEntity } from '@jsprismarine/block-behaviors';
import { DEFAULT_LIGHT_DAMPENING, blockProperties } from '@jsprismarine/blocks';
import type { HookBlock } from '@jsprismarine/blocks';
import { AIR } from '@jsprismarine/engine-systems';
import type { BlockRef, Dimension, WorldAccess } from '@jsprismarine/engine-systems';
import type { EntityActuator, EntityInstance } from '@jsprismarine/entities';
import type { BrainWorld } from '@jsprismarine/entity-brains';
import type { GoalWorld } from '@jsprismarine/entity-goals';
import type { FeatureWorld } from '@jsprismarine/features';
import type { BlockLightProperties, BlockLightView } from '@jsprismarine/lighting';
import type { BlockReference, WorldActions as ItemWorldActions } from '@jsprismarine/item-behaviors';
import type { SpawnWorld } from '@jsprismarine/spawning';

import type { ServerContent } from '../ServerContent';
import type { ContentBlock, ContentPosition, ServerWorldAdapter, ServerWorldSource } from './adapter';
import { CONTENT_AREAS, notWired } from './notWired';

/**
 * Reads the built content.
 *
 * The world views and the content build need each other: a behavior family
 * is registered before the block types exist, and it reads a block's
 * properties out of those types once it runs. The lookup closes that loop by
 * deferring the read to hook time, the same way
 * `@jsprismarine/item-behaviors`'s `deferredItemFactory` does.
 */
export type ContentLookup = () => ServerContent;

/** The nine content world interfaces, all backed by one adapter. */
export interface ContentWorldViews {
    /** `BlockWorld` for `@jsprismarine/block-behaviors`, which resolves a dimension per event. */
    readonly blockWorld: BlockWorld;
    /** `WorldActions` for `@jsprismarine/item-behaviors`, in the default dimension. */
    readonly itemActions: ItemWorldActions;
    /** `BlockLightView` for `@jsprismarine/lighting`, in the default dimension. */
    readonly lightView: BlockLightView;
    /** `WorldAccess` for `@jsprismarine/engine-systems`, in the default dimension. */
    readonly engineWorld: WorldAccess;
    /** `SpawnWorld` for `@jsprismarine/spawning`, in the default dimension. */
    readonly spawnWorld: SpawnWorld;
    /** `GoalWorld` for `@jsprismarine/entity-goals`, resolved per entity. */
    goalWorld(entity: EntityInstance): GoalWorld | undefined;
    /** `EntityActuator` for `@jsprismarine/entities`, resolved per entity. */
    actuator(entity: EntityInstance): EntityActuator;
    /** `BrainWorld` for `@jsprismarine/entity-brains`. */
    brainWorld(): BrainWorld;
    /** `FeatureWorld` for `@jsprismarine/features`, for one chunk being decorated. */
    featureWorld(chunkX: number, chunkZ: number): FeatureWorld;
}

/** The three dimensions `@jsprismarine/engine-systems` names, by their namespaced identifiers. */
const ENGINE_DIMENSIONS: Readonly<Record<string, Dimension>> = {
    'minecraft:overworld': 'overworld',
    'minecraft:nether': 'nether',
    'minecraft:the_end': 'the_end'
};

/**
 * The `@jsprismarine/engine-systems` dimension name for a namespaced identifier.
 *
 * That package names the three vanilla dimensions without a namespace,
 * because it only uses them to pick the lava flow rate and the infinite fire
 * source. A custom dimension has neither rule of its own, so it reads as the
 * overworld.
 */
export const engineDimensionOf = (dimension: string): Dimension => ENGINE_DIMENSIONS[dimension] ?? 'overworld';

/** Builds every content world interface over one adapter source. */
export const contentWorldViews = (
    world: ServerWorldSource,
    content: ContentLookup,
    defaultDimension = 'minecraft:overworld'
): ContentWorldViews => {
    const main = () => world.at(defaultDimension);

    return {
        blockWorld: { at: (dimension) => blockActionsOf(world.at(dimension), content) },
        itemActions: itemActionsOf(main(), content),
        lightView: lightViewOf(main(), content),
        engineWorld: engineWorldOf(main()),
        spawnWorld: spawnWorldOf(main(), content),
        goalWorld: (entity) => aiOf(main()).goalWorld(entity),
        actuator: (entity) => aiOf(main()).actuator(entity),
        brainWorld: () => aiOf(main()).brainWorld(),
        featureWorld: (chunkX, chunkZ) => generationOf(main()).featureWorld(chunkX, chunkZ)
    };
};

/** The runtime id of a block in the palette, or undefined when the palette has no such state. */
const runtimeIdOf = (content: ServerContent, block: ContentBlock): number | undefined => {
    const palette = content.blocks.palette;
    if (!palette.entry(block.identifier)) return undefined;
    return palette.runtimeId(block.identifier, block.states);
};

/** The `jsprismarine:block_properties` row of a block type, or the component's own defaults. */
const propertiesOf = (content: ServerContent, identifier: string) =>
    content.blocks.types.get(identifier)?.state().content.params(blockProperties) ?? DEFAULT_BLOCK_PROPERTIES;

/** The `minecraft:light_dampening` value for one block state. */
const lightDampeningOf = (content: ServerContent, block: HookBlock): number => {
    const runtimeId = runtimeIdOf(content, block);
    return runtimeId === undefined ? DEFAULT_LIGHT_DAMPENING : content.blocks.table.lightFilter[runtimeId]!;
};

/** `WorldActions` as `@jsprismarine/block-behaviors` declares it, for one dimension. */
const blockActionsOf = (adapter: ServerWorldAdapter, content: ContentLookup): BlockWorldActions => {
    const dimension = adapter.level.dimension;

    const hookBlock = (at: ContentPosition): HookBlock | undefined => {
        const block = adapter.blocks.get(at);
        return block && { identifier: block.identifier, position: at, dimension, states: block.states };
    };

    const destroy = adapter.blocks.destroy;

    return {
        getBlock: hookBlock,
        setBlock: (position, identifier, states = {}) => adapter.blocks.set(position, { identifier, states }, true),
        propertiesOf: (identifier) => propertiesOf(content(), identifier),
        lightDampeningOf: (block) => lightDampeningOf(content(), block),
        dropItem: (position, drop) => adapter.entities.drop(position, drop),
        // Left out rather than made to throw when the adapter cannot destroy, because a
        // family that cannot reach the table still has its own drop to fall back on.
        destroyBlock: destroy && ((position) => destroy(position)),
        spawnEntity: (position, identifier, data) => adapter.entities.spawn(identifier, position, data),
        removeEntity: (entity) => adapter.entities.remove(entity),
        entitiesAt: (position) =>
            adapter.entities.at(position).map((entity): WorldEntity => ({
                id: entity.id,
                identifier: entity.identifier,
                position: entity.position
            })),
        playSound: (position, sound) => adapter.effects.playSound(position, sound),
        spawnParticle: (position, particle) => adapter.effects.spawnParticle(position, particle),
        // The block hook carries no tick type, so the tick is scheduled for whatever stands
        // at the position now, which is what Java's `Block.scheduleTick` does too.
        scheduleTick: (position, delay, kind = 'block') =>
            adapter.ticks.schedule(kind, position, adapter.blocks.get(position)?.identifier ?? 'minecraft:air', delay),
        getBlockData: (position) => adapter.blocks.data(position),
        setBlockData: (position, data) => adapter.blocks.setData(position, data),
        notifyNeighbors: (position) => adapter.blocks.notifyNeighbors(position),
        redstonePower: (position) => adapter.blocks.power(position),
        lightLevel: (position) => adapter.blocks.light(position),
        random: () => adapter.random.nextFloat()
    };
};

/** `WorldActions` as `@jsprismarine/item-behaviors` declares it, which is a different interface. */
const itemActionsOf = (adapter: ServerWorldAdapter, content: ContentLookup): ItemWorldActions => {
    const items = () => adapter.items ?? notWired('items', CONTENT_AREAS.blocksAndItems)();

    return {
        blockAt: (position): BlockReference | undefined => {
            const block = adapter.blocks.get(position);
            return (
                block && {
                    identifier: block.identifier,
                    states: block.states,
                    position: { x: position.x, y: position.y, z: position.z }
                }
            );
        },
        hardnessOf: (block) => {
            const built = content();
            const id = runtimeIdOf(built, block);
            return id === undefined ? 0 : built.blocks.table.hardness[id]!;
        },
        stateOf: (source) => items().stateOf(source),
        environment: () => items().environment(),
        targetOf: (source) => items().targetOf(source),
        canNameEntity: (target) => items().canNameEntity?.(target) ?? true,
        canDyeEntity: (target, color) => items().canDyeEntity?.(target, color) ?? true,
        includes: (set, member) => items().includes(set, member),
        transform: (transformer, block) => items().transform(transformer, block),
        effectsOf: (potion) => items().effectsOf(potion),
        random: () => adapter.random.nextFloat(),
        perform: (action) => items().perform(action)
    };
};

/** `BlockLightView`, whose two per-state numbers come from the flattened block table. */
const lightViewOf = (adapter: ServerWorldAdapter, content: ContentLookup): BlockLightView => ({
    minY: adapter.level.minY,
    maxY: adapter.level.maxY,
    hasSkyLight: adapter.level.hasSkyLight,
    blockAt: (x, y, z): BlockLightProperties | undefined => {
        const block = adapter.blocks.get({ x, y, z });
        if (!block) return undefined;

        const built = content();
        const id = runtimeIdOf(built, block);
        if (id === undefined) return undefined;

        return {
            lightEmission: built.blocks.table.lightEmission[id]!,
            lightDampening: built.blocks.table.lightFilter[id]!
        };
    }
});

/** `WorldAccess` as `@jsprismarine/engine-systems` declares it. */
const engineWorldOf = (adapter: ServerWorldAdapter): WorldAccess => ({
    getBlock: (at): BlockRef => {
        const block = adapter.blocks.get(at);
        return block ? { name: block.identifier, states: block.states } : AIR;
    },
    setBlock: (at, to, notifyNeighbors) =>
        adapter.blocks.set(at, { identifier: to.name, states: to.states }, notifyNeighbors),
    getBlockEntityData: (at) => {
        const data = adapter.blocks.data(at);
        if (!data) return undefined;
        // The adapter's block entity record is open, because Bedrock block entities share no
        // schema, so the two numbers this package reads are narrowed rather than asserted.
        const analogOutput = typeof data.analogOutput === 'number' ? data.analogOutput : undefined;
        const comparatorOutput = typeof data.comparatorOutput === 'number' ? data.comparatorOutput : undefined;
        return { analogOutput, comparatorOutput };
    },
    setBlockEntityData: (at, data) =>
        adapter.blocks.setData(at, {
            ...adapter.blocks.data(at),
            analogOutput: data.analogOutput,
            comparatorOutput: data.comparatorOutput
        }),
    scheduleTick: (kind, at, type, delay, priority) => adapter.ticks.schedule(kind, at, type, delay, priority),
    hasScheduledTick: (kind, at, type) => adapter.ticks.isScheduled(kind, at, type),
    willTickThisTick: (kind, at, type) => adapter.ticks.runsThisTick(kind, at, type),
    // Taking a block out means raising its `onBreak` and rolling Java's table for it, and
    // carrying one means carrying its block entity with it. `src/world/EngineWorld.ts` is
    // where both are implemented, and it is the world every engine system actually runs
    // over; the only member of this one the server reads is `getBlock`, through
    // `blocks.power`. Rather than a second, weaker rule for a caller that does not exist,
    // these say who owns them.
    destroyBlock: notWired('engineWorld.destroyBlock', CONTENT_AREAS.world),
    moveBlock: notWired('engineWorld.moveBlock', CONTENT_AREAS.world),
    playSound: (at, sound) => adapter.effects.playSound(at, sound),
    getDifficulty: () => adapter.level.difficulty(),
    getWeather: () => adapter.level.weather(),
    isRainingAt: (at) => adapter.level.isRainingAt(at),
    getDimension: () => engineDimensionOf(adapter.level.dimension),
    getGameTime: () => adapter.level.gameTime(),
    randomInt: (bound) => adapter.random.nextInt(bound),
    randomFloat: () => adapter.random.nextFloat(),
    getMinY: () => adapter.level.minY,
    getMaxY: () => adapter.level.maxY
});

/**
 * `SpawnWorld`.
 *
 * `biome` is left out rather than implemented. It returns a `string` where
 * the adapter returns `string | undefined` for an unloaded chunk, and
 * `SpawnWorld` declares it optional so that a world which cannot always
 * answer omits it; a spawn rule's `is_biome` then refuses rather than
 * matching a biome the server guessed.
 */
const spawnWorldOf = (adapter: ServerWorldAdapter, content: ContentLookup): SpawnWorld => {
    const spawning = () => adapter.spawning ?? notWired('spawning', CONTENT_AREAS.entities)();

    return {
        site: (flag, at) => spawning().site(flag, at),
        block: (at) => adapter.blocks.get(at)?.identifier,
        // Off the flattened solidity column rather than off a name list, so a pack's own
        // block answers for itself. An unloaded position counts as solid: nothing may be
        // spawned into a chunk the server cannot see.
        solid: (at) => {
            const block = adapter.blocks.get(at);
            if (!block) return true;

            const built = content();
            const id = runtimeIdOf(built, block);
            return id === undefined ? true : built.blocks.table.solid[id] === 1;
        },
        light: (at) => adapter.blocks.light(at),
        biomeTags: (at) => adapter.blocks.biomeTags(at),
        surfaceY: (x, z) => adapter.blocks.surfaceY(x, z),
        minY: () => adapter.level.minY,
        players: () => adapter.entities.players().map((player) => ({ position: player.position })),
        poolCount: (pool) => spawning().poolCount(pool),
        typeCount: (identifier, at, radius) => adapter.entities.countOfType(identifier, at, radius),
        difficulty: () => adapter.level.difficulty(),
        weather: () => adapter.level.weather(),
        age: () => adapter.level.gameTime(),
        mobEventActive: (event) => spawning().mobEventActive(event),
        villageBorderDistance: (at) => spawning().villageBorderDistance?.(at),
        ...(adapter.spawning?.structureSpawnOverrideAt === undefined
            ? {}
            : {
                  structureSpawnOverrideAt: (identifier: string, at: ContentPosition) =>
                      adapter.spawning?.structureSpawnOverrideAt?.(identifier, at)
              })
    };
};

/** The AI group, or a clear failure naming the subsystem that owes it. */
const aiOf = (adapter: ServerWorldAdapter) => adapter.ai ?? notWired('ai', CONTENT_AREAS.entities)();

/** The generation group, or a clear failure naming the subsystem that owes it. */
const generationOf = (adapter: ServerWorldAdapter) =>
    adapter.generation ?? notWired('generation', CONTENT_AREAS.world)();
