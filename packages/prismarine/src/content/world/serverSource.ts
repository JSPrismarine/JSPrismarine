/**
 * The assembly step: the four subsystems' groups, spread into one adapter per dimension.
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
import type { RandomSource } from '@jsprismarine/predicates';
import { seededRandom } from '@jsprismarine/predicates';

import { createContentBlockGroup } from '../../block/contentAdapter';
import { createContentItemGroup } from '../../item/contentAdapter';
import { createItemActorPort } from '../../item/actorPort';
import { entityContentGroups } from '../../entity/contentAdapter';
import type { EntityRuntimes } from '../../entity/data/live';
import { worldEntityAccess } from '../../entity/worldContentAdapter';
import { worldBlockEntities, worldBlockStorage, worldContentGroups } from '../../world/contentAdapter';
import type { World } from '../../world/World';
import type { ServerItemActorPort } from '../../item/actorPort';
import type { ContentEffectSink, ServerWorldAdapter, ServerWorldSource } from './adapter';
import { CONTENT_AREAS, notWired } from './notWired';
import type { ContentLookup } from './views';

/** What {@link serverWorldSource} is built over. */
export interface ServerWorldSourceOptions {
    /** The live world of one dimension, or undefined when none of it is loaded. */
    worldFor(dimension: string): World | undefined;
    /** The built content, read at call time; see {@link ContentLookup}. */
    readonly content: ContentLookup;
    /** The world seed, which `level.seed` reports and which seeds the default random source. */
    readonly seed: bigint;
    /** The configured difficulty, as the protocol numbers it. */
    difficulty(): number;
    /** Replaces the random draws, which is how a test drives a probabilistic rule either way. */
    readonly random?: RandomSource;
    /**
     * The server's data-driven entity runtimes.
     *
     * Supplied by a server that runs its entities through
     * `@jsprismarine/entities` rather than through the written classes. One
     * runtime is opened per dimension as that dimension's adapter is
     * assembled, because the `spawning` and `ai` groups are projections of it.
     * Left out, and those two groups stay absent and every member of them says
     * which subsystem owes it.
     */
    readonly entityRuntimes?: EntityRuntimes;
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
        // Java's game event system, which a warden's vibration listener and a sculk sensor
        // read. Neither exists here, nothing else listens, and Bedrock puts nothing on the
        // wire for one, so there is no sink to send it to.
        emitGameEvent: notWired('effects.emitGameEvent', CONTENT_AREAS.entities)
    };
};

/** One dimension's adapter and the actor port inside it, which the interaction path also needs. */
interface DimensionWiring {
    readonly adapter: ServerWorldAdapter;
    readonly actors: ServerItemActorPort;
}

/** Builds the adapter for one dimension. */
const adapterFor = (dimension: string, options: ServerWorldSourceOptions): DimensionWiring => {
    const world = () => options.worldFor(dimension);
    const content = options.content;

    const {
        level,
        blocks: worldBlocks,
        ticks,
        random
    } = worldContentGroups({
        dimension,
        world,
        seed: options.seed,
        difficulty: options.difficulty,
        content,
        // Seeded from the world seed so a server replays its own draws, which is what makes
        // a bug in a probabilistic rule reproducible. It is not Java's `Random`.
        random: options.random ?? seededRandom(Number(BigInt.asIntN(32, options.seed)))
    });

    const blockGroup = createContentBlockGroup({
        storage: worldBlockStorage(world),
        blockEntities: worldBlockEntities(world),
        content,
        dimension
    });

    const entities = worldEntityAccess({ world, content });
    const effects = worldEffectSink(world, dimension);
    const blocks = { ...worldBlocks, ...blockGroup };

    // The entity subsystem's own two groups are projections of its runtime, so the runtime is
    // opened before the adapter and handed the finished adapter afterwards; see `attach`.
    const live = options.entityRuntimes?.open({
        dimension,
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
                  interactWithEntity: (target, player, itemIdentifier) =>
                      live.interactWithItem(target, player, itemIdentifier)
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
            content
        }),
        // `generation` is left out rather than filled with throwing members: the adapter
        // declares it optional so that the projection in `views.ts` reports the subsystem
        // that owes it. `commands` is the network subsystem's. `spawning` and `ai` are the
        // entity subsystem's, and are absent on a server that runs no data-driven entities.
        ...(liveEntities ?? {})
    };

    live?.attach(adapter);
    return { actors, adapter };
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
    /** The item actor port of one dimension; see {@link ServerItemActorPort.duringInteraction}. */
    actorsAt(dimension: string): ServerItemActorPort;
}

/**
 * The world the content packages act through on a running server.
 *
 * @returns A source that hands out one adapter per dimension, built on first use and kept,
 *   so the block group's neighbor-update budget and the item cooldowns of a dimension outlive
 *   the call that made them.
 */
export const serverWorldSource = (options: ServerWorldSourceOptions): ServerWorldHandle => {
    const wirings = new Map<string, DimensionWiring>();

    const wiringAt = (dimension: string): DimensionWiring => {
        const existing = wirings.get(dimension);
        if (existing) return existing;

        const created = adapterFor(dimension, options);
        wirings.set(dimension, created);
        return created;
    };

    return {
        at: (dimension) => wiringAt(dimension).adapter,
        actorsAt: (dimension) => wiringAt(dimension).actors
    };
};
