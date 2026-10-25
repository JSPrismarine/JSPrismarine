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
import type { ItemActorPort } from '../../item/contentAdapter';
import { worldEntityAccess } from '../../entity/worldContentAdapter';
import { worldBlockEntities, worldBlockStorage, worldContentGroups } from '../../world/contentAdapter';
import type { World } from '../../world/World';
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
}

/**
 * What the item behaviors do to an entity, an inventory or a screen.
 *
 * Twenty-two of the twenty-eight `ItemWorldAction` variants land here, along with the two
 * questions about whoever is holding the item. All three need a player session and an entity
 * index that can answer for an arbitrary content identifier, and the network and entity
 * subsystems own those. Until they supply them an item behavior that reaches for a player
 * says so rather than doing nothing and reporting success.
 */
const unwiredItemActors: ItemActorPort = {
    stateOf: notWired('items.stateOf', CONTENT_AREAS.entities),
    targetOf: notWired('items.targetOf', CONTENT_AREAS.entities),
    perform: notWired('items.perform', CONTENT_AREAS.network)
};

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

/** Builds the adapter for one dimension. */
const adapterFor = (dimension: string, options: ServerWorldSourceOptions): ServerWorldAdapter => {
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

    return {
        level,
        blocks: { ...worldBlocks, ...blockGroup },
        entities,
        effects,
        ticks,
        random,
        items: createContentItemGroup({
            blocks: blockGroup,
            entities,
            effects,
            level,
            actors: unwiredItemActors,
            content
        })
        // `spawning`, `ai` and `generation` are left out rather than filled with throwing
        // members: the adapter declares them optional so that the projection in `views.ts`
        // reports the subsystem that owes each one. `commands` is the network subsystem's.
    };
};

/**
 * The world the content packages act through on a running server.
 *
 * @returns A source that hands out one adapter per dimension, built on first use and kept,
 *   so the block group's neighbor-update budget and the block entity records of a dimension
 *   outlive the call that made them.
 */
export const serverWorldSource = (options: ServerWorldSourceOptions): ServerWorldSource => {
    const adapters = new Map<string, ServerWorldAdapter>();

    return {
        at: (dimension) => {
            const existing = adapters.get(dimension);
            if (existing) return existing;

            const created = adapterFor(dimension, options);
            adapters.set(dimension, created);
            return created;
        }
    };
};
