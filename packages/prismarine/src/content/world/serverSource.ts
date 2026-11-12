/**
 * The assembly step: the four subsystems' groups, spread into one adapter per world, which is
 * each dimension of each level.
 *
 * Each subsystem exports a factory for the groups it owns and knows nothing about the other
 * three. This is the one module that knows all four, and it is what a running server passes
 * to `buildServerContent` in place of {@link import('./unwired').unwiredWorldSource}. With
 * the unwired source every member throws; with this one the blocks, the clock, the scheduled
 * ticks, the effects and most of the entity queries reach the live world, and the members no
 * subsystem can answer yet keep throwing and say who owes them.
 *
 * The adapters are built before the first world loads, because `buildServerContent` reads
 * the default dimension's `level` while it is still building the registries. So every member
 * resolves its world at call time; see `src/world/contentAdapter.ts`.
 */
import { javaBlockStates } from '@jsprismarine/mapping';
import type { RandomSource, SeededRandomState } from '@jsprismarine/predicates';
import { isStatefulRandomSource, seededRandom } from '@jsprismarine/predicates';

import { createContentBlockGroup } from '../../block/contentAdapter';
import { resolveTransform } from '../../item/blockTransformers';
import { createContentItemGroup } from '../../item/contentAdapter';
import { createItemActorPort } from '../../item/actorPort';
import { entityContentGroups } from '../../entity/contentAdapter';
import type { EntityRuntimes, LiveEntityRuntime } from '../../entity/data/live';
import { worldEntityAccess } from '../../entity/worldContentAdapter';
import { worldBlockEntities, worldBlockStorage, worldContentGroups } from '../../world/contentAdapter';
import type { World } from '../../world/World';
import { worldKeyOf, worldOfKey } from '../../world/worldKey';
import type { ServerItemActorPort } from '../../item/actorPort';
import type { ContentEffectSink, ServerWorldAdapter, ServerWorldSource } from './adapter';
import type { ContentLookup } from './views';

/** What {@link serverWorldSource} is built over. */
export interface ServerWorldSourceOptions {
    /**
     * The live world of one dimension, or undefined when none of it is loaded.
     * @param dimension - The namespaced dimension identifier.
     * @param level - The level's name, or undefined for the default level.
     */
    worldFor(dimension: string, level?: string): World | undefined;
    /** The built content, read at call time; see {@link ContentLookup}. */
    readonly content: ContentLookup;
    /**
     * The default level's world seed, which `level.seed` reports and which seeds the default
     * random source.
     */
    readonly seed: bigint;
    /**
     * The seed of a level other than the default, for its adapters' `level.seed` and random
     * source. Left out, every level reports {@link seed}.
     * @param level - The level's name.
     */
    seedOf?(level: string): bigint;
    /** The configured difficulty, as the protocol numbers it. */
    difficulty(): number;
    /** Replaces the random draws, which is how a test drives a probabilistic rule either way. */
    readonly random?: RandomSource;
    /**
     * The server's data-driven entity runtimes.
     *
     * Supplied by a server that runs its entities through
     * `@jsprismarine/entities` rather than through the written classes. One
     * runtime is opened per world as that world's adapter is assembled,
     * because the `spawning` and `ai` groups are projections of it.
     * Left out, and those two groups stay absent and every member of them says
     * which subsystem owes it.
     */
    readonly entityRuntimes?: EntityRuntimes;
    /**
     * The default level's name. A caller that names it reaches the same world as one that
     * passes no level, which is how the content packages address it.
     *
     * Left out, and the source serves one level: whatever level a caller names, it reaches the
     * default level's worlds, so a test's world double and its level double are one world.
     */
    defaultLevel?(): string | undefined;
}

/** The `effects` group, which is three broadcasts and nothing read back. */
const worldEffectSink = (world: () => World | undefined, dimension: string): ContentEffectSink => {
    const live = (): World => {
        const loaded = world();
        if (loaded === undefined) throw new Error(`no ${dimension} world is loaded, so nothing can be played in it`);
        return loaded;
    };

    return {
        playSound: (at, sound) => live().playNamedSound(at.x, at.y, at.z, sound),
        spawnParticle: (at, particle) => live().spawnNamedParticle(at.x, at.y, at.z, particle),
        emitGameEvent: (event, at, sourceId) => world()?.emitGameEvent(event, at, sourceId)
    };
};

/** One world's adapter and the actor port inside it, which the interaction path also needs. */
interface DimensionWiring {
    readonly adapter: ServerWorldAdapter;
    readonly actors: ServerItemActorPort;
    /** The world's entity runtime, when the source was given {@link ServerWorldSourceOptions.entityRuntimes}. */
    readonly live: LiveEntityRuntime | undefined;
}

/** Builds the adapter for one dimension of one level, `levelName` undefined meaning the default. */
const adapterFor = (
    dimension: string,
    levelName: string | undefined,
    options: ServerWorldSourceOptions
): DimensionWiring => {
    const world = () => options.worldFor(dimension, levelName);
    const content = options.content;
    // Each level's own, as its worlds take theirs, so a second level neither reports the default
    // level's seed nor replays the default level's random draws.
    const seed = levelName === undefined ? options.seed : (options.seedOf?.(levelName) ?? options.seed);

    const {
        level,
        blocks: worldBlocks,
        ticks,
        random
    } = worldContentGroups({
        dimension,
        world,
        seed,
        difficulty: options.difficulty,
        content,
        // Seeded from the world seed so a server replays its own draws, which is what makes
        // a bug in a probabilistic rule reproducible. It is not Java's `Random`.
        random: options.random ?? seededRandom(Number(BigInt.asIntN(32, seed)))
    });

    const blockGroup = createContentBlockGroup({
        storage: worldBlockStorage(world),
        blockEntities: worldBlockEntities(world),
        content,
        dimension,
        updateEngineAround: (at, block) => {
            const live = world();
            if (live !== undefined) {
                // Content hooks store Bedrock state values; the engine reads Java's words and
                // maps them back when it writes. Passing raw torch directions through this
                // seam made the write reverse them a second time.
                live.getSystems().updateAround(at, {
                    name: block.identifier,
                    states: javaBlockStates(block.identifier, block.states)
                });
            }
        }
    });

    const entities = worldEntityAccess({
        world,
        content,
        spawnDataDriven: (identifier, at, data) => {
            if (identifier === 'minecraft:item' || identifier === 'minecraft:player') return undefined;

            const live = options.entityRuntimes?.at(dimension, levelName);
            const reference = identifier.includes('<') ? identifier.slice(0, identifier.indexOf('<')) : identifier;
            if (live === undefined || !content().entities.registry.has(reference)) return undefined;

            return live.runtime.spawn(identifier, at, data === undefined ? {} : { data })?.id ?? 0;
        }
    });
    const effects = worldEffectSink(world, dimension);
    const blocks = { ...worldBlocks, ...blockGroup };

    // The entity subsystem's own two groups are projections of its runtime, so the runtime is
    // opened before the adapter and handed the finished adapter afterwards; see `attach`.
    const live = options.entityRuntimes?.open({
        dimension,
        level: levelName,
        content,
        world: { level, blocks, effects, random },
        entities,
        liveWorld: world,
        report: (message) => reportFrom(world, dimension, message)
    });
    const liveEntities = live === undefined ? undefined : entityContentGroups(live.runtime);
    const actors = createItemActorPort({
        world,
        entities,
        level,
        ...(live === undefined
            ? {}
            : {
                  launchProjectile: (action, shooter) => live.launchProjectile(action, shooter) !== undefined,
                  attachLead: (holder, target) => live.attachLead(holder.runtimeId, target.runtimeId),
                  canNameEntity: (target) => live.canNameEntity(target),
                  nameEntity: (target, name) => live.nameEntity(target, name),
                  canDyeEntity: (target, color) => live.canDyeEntity(target, color),
                  dyeEntity: (target, color) => live.dyeEntity(target, color),
                  interactWithEntity: (target, player, itemIdentifier, heldItem) =>
                      live.interactWithItem(target, player, itemIdentifier, heldItem)
              })
    });

    const adapter: ServerWorldAdapter = {
        level,
        blocks,
        entities: liveEntities?.entities ?? entities,
        effects,
        ticks,
        random,
        items: createContentItemGroup({
            blocks: blockGroup,
            entities: liveEntities?.entities ?? entities,
            effects,
            level,
            actors,
            content,
            transformers: (transformer, block, face) =>
                resolveTransform(
                    content().blockTransformers,
                    { tags: content().tags, blockAt: (at) => blockGroup.get(at) },
                    transformer,
                    block,
                    face
                ),
            placeEndCrystal: (base) => {
                const loaded = world();
                if (loaded === undefined || live === undefined) return false;

                const support = loaded.loadedBlockAt(base.x, base.y, base.z)?.name;
                if (support !== 'minecraft:obsidian' && support !== 'minecraft:bedrock') return false;
                if (loaded.loadedBlockAt(base.x, base.y + 1, base.z)?.name !== 'minecraft:air') return false;

                const overlapsSpawnVolume = loaded.actors().some((entity) => {
                    const position = entity.getPosition();
                    const box = entity.getBox();
                    const left = position.getX() - box.width / 2;
                    const right = position.getX() + box.width / 2;
                    const bottom = entity.getFeetY();
                    const top = bottom + box.height;
                    const nearX = right > base.x && left < base.x + 1;
                    const nearY = top > base.y + 1 && bottom < base.y + 3;
                    const nearZ =
                        position.getZ() + box.width / 2 > base.z && position.getZ() - box.width / 2 < base.z + 1;
                    return nearX && nearY && nearZ;
                });
                if (overlapsSpawnVolume) return false;

                const crystal = live.runtime.spawn(
                    'minecraft:ender_crystal',
                    { x: base.x + 0.5, y: base.y + 1, z: base.z + 0.5 },
                    { showBottom: false }
                );
                if (crystal === undefined) return false;

                loaded.getDragonFight()?.tryRespawn();
                return true;
            }
        }),
        // `generation` is left out rather than filled with throwing members: the adapter
        // declares it optional so that the projection in `views.ts` reports the subsystem
        // that owes it. `commands` is the network subsystem's. `spawning` and `ai` are the
        // entity subsystem's, and are absent on a server that runs no data-driven entities.
        ...(liveEntities ?? {})
    };

    live?.attach(adapter);
    return { actors, adapter, live };
};

/** Writes one of the entity runtime's reports to the server log, when there is a server. */
const reportFrom = (world: () => World | undefined, dimension: string, message: string): void => {
    world()?.getServer().getLogger().debug(`${dimension}: ${message}`, 'entity/data/live');
};

/**
 * The world source, plus the one member of it the interaction path reaches past the adapter for.
 *
 * `targetOf` answers a question about an interaction in progress, so the code that runs the
 * interaction has to be able to say what it landed on. That is the port rather than the adapter,
 * and `ServerWorldAdapter` has nowhere to put it: the content packages must not be able to record
 * a target for themselves.
 */
export interface ServerWorldHandle extends ServerWorldSource {
    /**
     * The adapter for one world.
     *
     * The content packages call this with a dimension alone and so reach the default level. A
     * world of another `worlds.<name>` entry passes its level, so its blocks, random stream and
     * entity runtime are its own rather than the default level's.
     * @param dimension - The namespaced dimension identifier, such as `minecraft:overworld`.
     * @param level - The level's name, or undefined for the default level.
     */
    at(dimension: string, level?: string): ServerWorldAdapter;
    /**
     * The item actor port of one world; see {@link ServerItemActorPort.duringInteraction}.
     * @param dimension - The namespaced dimension identifier.
     * @param level - The level's name, or undefined for the default level.
     */
    actorsAt(dimension: string, level?: string): ServerItemActorPort;
    /**
     * The entity runtime of one world, or undefined when its adapter was not built yet or the
     * source runs no data-driven entities. Builds nothing.
     * @param dimension - The namespaced dimension identifier.
     * @param level - The level's name, or undefined for the default level.
     */
    entitiesAt(dimension: string, level?: string): LiveEntityRuntime | undefined;
    /**
     * Forgets the adapters and entity runtimes of a level that has unloaded, once its save is
     * written, so the level loaded again under that name starts from what the save holds rather
     * than from the entities and draws of the instance before it.
     * @param level - The level's name.
     */
    closeLevel(level: string): void;
    /**
     * Captures the seeded random stream of each content adapter already built, under its
     * {@link worldKeyOf} key, which for the default level is the bare dimension.
     */
    saveRandomStates(): readonly (readonly [world: string, state: SeededRandomState])[];
    /** Restores exactly the adapter streams represented by a replay state. */
    restoreRandomStates(states: unknown): void;
}

/**
 * The world the content packages act through on a running server.
 *
 * @returns A source that hands out one adapter per world, built on first use and kept, so the
 *   block group's neighbor-update budget and the item cooldowns of a world outlive the call that
 *   made them.
 */
export const serverWorldSource = (options: ServerWorldSourceOptions): ServerWorldHandle => {
    const wirings = new Map<string, DimensionWiring>();
    const entityRuntimes = options.entityRuntimes;

    // By world rather than by dimension: every level has an Overworld, and an adapter holds the
    // world's random stream, cooldowns and entity runtime, which belong to that one world.
    // The default level named and the default level left out are one world, filed once.
    const keyOf = (dimension: string, level: string | undefined): string =>
        worldKeyOf(
            dimension,
            options.defaultLevel === undefined || level === options.defaultLevel() ? undefined : level
        );

    const wiringAt = (key: string): DimensionWiring => {
        const existing = wirings.get(key);
        if (existing) return existing;

        const { dimension, level } = worldOfKey(key);
        const created = adapterFor(dimension, level, options);
        wirings.set(key, created);
        return created;
    };

    return {
        at: (dimension, level) => wiringAt(keyOf(dimension, level)).adapter,
        actorsAt: (dimension, level) => wiringAt(keyOf(dimension, level)).actors,
        entitiesAt: (dimension, level) => wirings.get(keyOf(dimension, level))?.live,
        closeLevel: (level) => {
            const filed = worldOfKey(keyOf('', level)).level;
            for (const key of [...wirings.keys()]) {
                const world = worldOfKey(key);
                if (world.level !== filed) continue;
                wirings.delete(key);
                entityRuntimes?.close(world.dimension, world.level);
            }
        },
        saveRandomStates: () =>
            [...wirings]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, wiring]) => {
                    const random = wiring.adapter.random;
                    if (!isStatefulRandomSource(random)) {
                        throw new Error(`The ${key} content random source cannot be saved for replay`);
                    }
                    return [key, random.saveState()] as const;
                }),
        restoreRandomStates: (states: unknown) => {
            if (!Array.isArray(states)) throw new TypeError('Invalid content random states');

            const entries = new Map<string, unknown>();
            for (const entry of states) {
                if (
                    !Array.isArray(entry) ||
                    entry.length !== 2 ||
                    typeof entry[0] !== 'string' ||
                    entries.has(entry[0])
                ) {
                    throw new TypeError('Invalid content random state entry');
                }
                entries.set(entry[0], entry[1]);
            }

            const missing = [...wirings.keys()].filter((key) => !entries.has(key));
            if (missing.length > 0) {
                throw new Error(`Replay state has no content random stream for: ${missing.join(', ')}`);
            }
            // Validate every saved counter before constructing adapters or changing a live stream.
            for (const state of entries.values()) {
                const candidate = seededRandom(0);
                candidate.restoreState(state);
            }

            if (options.random !== undefined && !isStatefulRandomSource(options.random)) {
                throw new Error('The configured content random source cannot be restored for replay');
            }

            for (const key of entries.keys()) {
                if (wirings.has(key)) continue;
                wiringAt(key);
            }

            const prepared = [...entries].map(([key, state]) => {
                const random = wirings.get(key)!.adapter.random;
                if (!isStatefulRandomSource(random)) {
                    throw new Error(`The ${key} content random source cannot be restored for replay`);
                }
                const candidate = seededRandom(0);
                candidate.restoreState(state);
                return { random, state };
            });

            for (const entry of prepared) entry.random.restoreState(entry.state);
        },
        ...(entityRuntimes === undefined ? {} : { goalWorld: (entity) => entityRuntimes.goalWorldFor(entity) })
    };
};
