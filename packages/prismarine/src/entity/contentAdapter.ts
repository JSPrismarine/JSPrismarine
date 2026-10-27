/**
 * The entity subsystem's slice of `ServerWorldAdapter`.
 *
 * `src/content/world/adapter.ts` is one interface with eleven groups, split
 * four ways: blocks and items own two, the world owns two, the network owns
 * two, and this subsystem owns three - `entities`, `spawning` and `ai`. Each
 * subsystem exports a factory for its own groups and the assembly step spreads
 * them into one object, so no subsystem has to know what the other three are
 * doing.
 *
 * ```typescript
 * const runtime = new EntityRuntime({ content, world, host });
 * const adapter: ServerWorldAdapter = {
 *     ...coreGroups,
 *     ...entityContentGroups(runtime)
 * };
 * ```
 *
 * Every member answers out of the data-driven runtime. Nothing here invents a
 * value: `villageBorderDistance` is left out when the host cannot answer it,
 * which is what makes `minecraft:player_in_village_filter` refuse rather than
 * match everywhere.
 */
import type { EntityActuator } from '@jsprismarine/entities';
import type { BrainWorld } from '@jsprismarine/entity-brains';
import type { GoalWorld } from '@jsprismarine/entity-goals';
import type { SpawnSiteFlag } from '@jsprismarine/spawning';

import type {
    ContentAiAccess,
    ContentEntity,
    ContentEntityAccess,
    ContentPosition,
    ContentSpawnAccess
} from '../content/world/adapter';
import type { DataEntity } from './data/DataEntity';
import type { EntityRuntime } from './data/EntityRuntime';

/** The three groups of `ServerWorldAdapter` the entity subsystem owns. */
export interface EntityContentGroups {
    readonly entities: ContentEntityAccess;
    readonly spawning: ContentSpawnAccess;
    readonly ai: ContentAiAccess;
}

/** One live entity as the content packages read one. */
const contentEntityOf = (entity: DataEntity): ContentEntity => ({
    id: entity.id,
    identifier: entity.identifier,
    position: entity.position,
    tags: [...entity.body.tags]
});

/**
 * Builds the `entities`, `spawning` and `ai` groups over one runtime.
 *
 * @param runtime - The live entities of the dimension this adapter is for.
 */
export const entityContentGroups = (runtime: EntityRuntime): EntityContentGroups => ({
    entities: entityAccessOf(runtime),
    spawning: spawnAccessOf(runtime),
    ai: aiAccessOf(runtime)
});

/** `ContentEntityAccess`: spawning, removing and counting the entities of one dimension. */
const entityAccessOf = (runtime: EntityRuntime): ContentEntityAccess => ({
    at: (position) =>
        runtime
            .all()
            .filter(
                (entity) =>
                    Math.floor(entity.position.x) === position.x &&
                    Math.floor(entity.position.y) === position.y &&
                    Math.floor(entity.position.z) === position.z
            )
            .map(contentEntityOf),
    near: (center, radius) => runtime.near(center, radius).map(contentEntityOf),
    players: () => runtime.host.players(),
    spawn: (identifier, at, data) => {
        return (
            runtime.spawn(identifier, at, {
                ...(data === undefined ? {} : { data })
            })?.id ?? 0
        );
    },
    remove: (id) => runtime.remove(id, 'removed'),
    drop: (at, item) => runtime.host.drop(at, item),
    countOfType: (identifier, at, radius) => runtime.countOfType(identifier, at, radius)
});

/** `ContentSpawnAccess`: the facts a spawn rule asks for that nothing else does. */
const spawnAccessOf = (runtime: EntityRuntime): ContentSpawnAccess => ({
    site: (flag, at) => siteFlag(runtime, flag, at),
    poolCount: (pool) => runtime.poolCount(pool),
    mobEventActive: (event) => runtime.host.mobEventActive(event),
    ...(runtime.host.villageBorderDistance === undefined
        ? {}
        : { villageBorderDistance: (at: ContentPosition) => runtime.host.villageBorderDistance?.(at) }),
    ...(runtime.host.structureSpawnOverrideAt === undefined
        ? {}
        : {
              structureSpawnOverrideAt: (identifier: string, at: ContentPosition) =>
                  runtime.host.structureSpawnOverrideAt?.(identifier, at)
          })
});

/** The two water identifiers, which decide whether a spawn site is underwater. */
const WATER = new Set(['minecraft:water', 'minecraft:flowing_water']);

/** The two lava identifiers. */
const LAVA = new Set(['minecraft:lava', 'minecraft:flowing_lava']);

/** The snow a biome filter's `is_snow_covered` test looks for on top of a site. */
const SNOW = new Set(['minecraft:snow_layer', 'minecraft:snow', 'minecraft:powder_snow']);

/**
 * One boolean fact about a spawn position.
 *
 * All six come out of the blocks and the surface height rather than out of a
 * table, which is why they are computed here instead of being asked of the
 * host: a server that can read its chunks can answer every one of them, and a
 * server that cannot read a chunk answers false for all six, which stops the
 * attempt rather than spawning into an unloaded column.
 */
const siteFlag = (runtime: EntityRuntime, flag: SpawnSiteFlag, at: ContentPosition): boolean => {
    const blocks = runtime.world.blocks;
    const identifier = blocks.get(at)?.identifier;
    if (identifier === undefined) return false;

    switch (flag) {
        case 'surface': {
            const surface = blocks.surfaceY(at.x, at.z);
            return surface !== undefined && at.y >= surface;
        }
        case 'underground': {
            const surface = blocks.surfaceY(at.x, at.z);
            return surface !== undefined && at.y < surface;
        }
        case 'underwater':
            return WATER.has(identifier);
        case 'lava':
            return LAVA.has(identifier);
        case 'bubble_column':
            return identifier === 'minecraft:bubble_column';
        case 'snow_covered': {
            const below = blocks.get({ x: at.x, y: at.y - 1, z: at.z })?.identifier;
            return SNOW.has(identifier) || (below !== undefined && SNOW.has(below));
        }
    }
};

/** `ContentAiAccess`: the per-entity seams that need an entity index. */
const aiAccessOf = (runtime: EntityRuntime): ContentAiAccess => ({
    goalWorld: (instance): GoalWorld | undefined => runtime.goalWorldFor(instance),
    actuator: (instance): EntityActuator => {
        const own = runtime.actuatorFor(instance) ?? instance.actuator;
        if (own !== undefined) return own;

        // An instance the runtime never placed has no body to drive, and `EntityActuator` has
        // no member that can honestly answer for one. Saying so beats moving something that is
        // not in the world.
        throw new Error(`${instance.type.identifier} is not in this dimension's entity index, so it has no actuator`);
    },
    brainWorld: (): BrainWorld => runtime.brainWorld()
});
