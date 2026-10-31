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
import type {
    BlockFlammability,
    BlockWorld,
    WorldActions as BlockWorldActions,
    WorldEntity
} from '@jsprismarine/block-behaviors';
import { DEFAULT_LIGHT_DAMPENING, blockProperties, flammable } from '@jsprismarine/blocks';
import type { HookBlock } from '@jsprismarine/blocks';
import {
    AIR,
    hasSturdyTopFace as engineHasSturdyTopFace,
    isFullCube as engineIsFullCube,
    TICK_PRIORITIES
} from '@jsprismarine/engine-systems';
import type { BlockRef, WorldAccess } from '@jsprismarine/engine-systems';
import type { BlockTickPriority } from '@jsprismarine/block-behaviors';
import { bedrockBlockStateToJava, bedrockBlockToJava } from '@jsprismarine/mapping';
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
import {
    FIRE_SPREAD_RADIUS,
    LAVA_SOURCE_CONVERSION,
    UNLIMITED_FIRE_SPREAD_RADIUS,
    WATER_SOURCE_CONVERSION,
    fireSpreadRadius
} from './gameRules';

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

/** The default chance modifiers `minecraft:flammable` supplies when set to true. */
const DEFAULT_FLAMMABLE = (() => {
    const parsed = flammable.schema({});
    if (!parsed.ok || typeof parsed.value === 'boolean') {
        throw new Error('the minecraft:flammable schema rejected its own defaults');
    }
    return parsed.value;
})();

/** Reads the active state's Bedrock flammability component, including permutations. */
const flammabilityOf = (content: ServerContent, block: HookBlock): BlockFlammability | undefined => {
    const component = content.blocks.types.get(block.identifier)?.state(block.states).content.params(flammable);
    if (component === undefined) return undefined;
    if (component === false) return { igniteOdds: 0, burnOdds: 0 };
    if (component === true) {
        return {
            igniteOdds: DEFAULT_FLAMMABLE.catchChanceModifier,
            burnOdds: DEFAULT_FLAMMABLE.destroyChanceModifier
        };
    }
    return { igniteOdds: component.catchChanceModifier, burnOdds: component.destroyChanceModifier };
};

/** Reads Java block tags through the state-aware Bedrock-to-Java mapping. */
const hasBlockTag = (content: ServerContent, block: HookBlock, tag: string): boolean => {
    if (content.tags.includes('block', tag, block.identifier)) return true;
    const mapped = bedrockBlockStateToJava(block.identifier, block.states);
    const javaIdentifiers = mapped.kind === 'mapped' ? [mapped.java.name] : bedrockBlockToJava(block.identifier);
    return javaIdentifiers.some((identifier) => content.tags.includes('block', tag, identifier));
};

/** `WorldActions` as `@jsprismarine/block-behaviors` declares it, for one dimension. */
const blockActionsOf = (adapter: ServerWorldAdapter, content: ContentLookup): BlockWorldActions => {
    const dimension = adapter.level.dimension;

    const hookBlock = (at: ContentPosition): HookBlock | undefined => {
        const block = adapter.blocks.get(at);
        return block && { identifier: block.identifier, position: at, dimension, states: block.states };
    };

    const destroy = adapter.blocks.destroy;
    const engineWorld = engineWorldOf(adapter);
    const tickPriority: Record<BlockTickPriority, number> = {
        extremely_high: TICK_PRIORITIES.EXTREMELY_HIGH,
        very_high: TICK_PRIORITIES.VERY_HIGH,
        high: TICK_PRIORITIES.HIGH,
        normal: TICK_PRIORITIES.NORMAL
    };

    return {
        getBlock: hookBlock,
        setBlock: (position, identifier, states = {}, notifyNeighbors = true, placement) =>
            adapter.blocks.set(position, { identifier, states }, notifyNeighbors, placement),
        ...(adapter.blocks.move === undefined
            ? {}
            : { moveBlock: (from: ContentPosition, to: ContentPosition) => adapter.blocks.move?.(from, to) }),
        propertiesOf: (identifier) => propertiesOf(content(), identifier),
        lightDampeningOf: (block) => lightDampeningOf(content(), block),
        flammabilityOf: (block) => flammabilityOf(content(), block),
        hasBlockTag: (block, tag) => hasBlockTag(content(), block, tag),
        hasSturdyTopFace: (block) => engineHasSturdyTopFace(engineWorld.getBlock(block.position)),
        isFullCube: (block) => engineIsFullCube(engineWorld.getBlock(block.position)),
        fluidSourceConversion: (kind) => {
            const value = adapter.level.gameRule(kind === 'water' ? WATER_SOURCE_CONVERSION : LAVA_SOURCE_CONVERSION);
            return typeof value === 'boolean' ? value : kind === 'water';
        },
        dropItem: (position, drop) => adapter.entities.drop(position, drop),
        // Left out rather than made to throw when the adapter cannot destroy, because a
        // family that cannot reach the table still has its own drop to fall back on.
        destroyBlock: destroy && ((position, options) => destroy(position, options)),
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
        scheduleTick: (position, delay, kind = 'block', priority = 'normal') =>
            adapter.ticks.schedule(
                kind,
                position,
                adapter.blocks.get(position)?.identifier ?? 'minecraft:air',
                delay,
                tickPriority[priority]
            ),
        willTickThisTick: (position) =>
            adapter.ticks.runsThisTick('block', position, adapter.blocks.get(position)?.identifier ?? 'minecraft:air'),
        randomInt: (bound) => adapter.random.nextInt(bound),
        randomFloat: () => adapter.random.nextFloat(),
        difficulty: () => adapter.level.difficulty(),
        weather: () => adapter.level.weather(),
        isRainingAt: (position) => adapter.level.isRainingAt(position),
        canFireSpreadAround: (position) => {
            const radius = fireSpreadRadius(adapter.level.gameRule(FIRE_SPREAD_RADIUS));
            if (radius === UNLIMITED_FIRE_SPREAD_RADIUS) return true;

            return adapter.entities.players().some((player) => {
                if (player.spectator === true) return false;
                const dx = player.position.x - position.x;
                const dy = player.position.y - position.y;
                const dz = player.position.z - position.z;
                return Math.sqrt(dx * dx + dy * dy + dz * dz) < radius;
            });
        },
        getBlockData: (position) => adapter.blocks.data(position),
        setBlockData: (position, data) => adapter.blocks.setData(position, data),
        notifyNeighbors: (position) => adapter.blocks.notifyNeighbors(position),
        redstonePower: (position) => adapter.blocks.power(position),
        redstoneSignal: (position, directionToSource) =>
            adapter.blocks.signal?.(position, directionToSource) ?? adapter.blocks.power(position),
        redstoneDirectSignal: (position, directionToSource) =>
            adapter.blocks.directSignal?.(position, directionToSource) ??
            adapter.blocks.signal?.(position, directionToSource) ??
            adapter.blocks.power(position),
        redstoneConductor: (position) => adapter.blocks.isRedstoneConductor?.(position) ?? false,
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
        locate: (destination, origin) => items().locate?.(destination, origin),
        supports: (action) => items().supports?.(action) ?? true,
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
    }
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
        worldSpawn: () =>
            adapter.level.dimension === 'minecraft:overworld' ? adapter.level.spawnPosition() : undefined,
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
