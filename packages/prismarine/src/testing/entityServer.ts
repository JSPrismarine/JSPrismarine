/**
 * The server an entity standing in a test world reaches.
 *
 * An `Entity` takes its server from the world its position names, and then asks it for things
 * no test ever cares about: the event bus a damage event goes onto, the tick an effect expires
 * on, the content the enchantment step reads. Every entity test used to answer those itself,
 * in an object literal typed `any`, and each one answered a different subset. When `damage`
 * grew a call to `getContent`, nine suites failed at once with `getContent is not a function`.
 *
 * This is that answer, written once and type-checked. `tsc` does not look at `*.test.ts` - the
 * root tsconfig excludes them - so a double written inside a test file is checked by nothing
 * at all. This module is ordinary source, so the members here are checked against the real
 * `Server`, and the next one an entity reaches for is added in one place.
 */
import { Difficulty } from '@jsprismarine/minecraft';
import type { Logger } from '@jsprismarine/logger';

import type { Config } from '../config/Config';
import type { ServerContent } from '../content/ServerContent';
import { buildServerContent } from '../content/ServerContent';
import { fixtureContentOptions } from '../content/testing';
import type { EntityRuntime } from '../entity/data/EntityRuntime';
import { EntityIndex } from '../entity/data/entityIndex';
import type { LiveEntityRuntime } from '../entity/data/live';
import { EntityRuntimes } from '../entity/data/live';
import { serverWorldSource } from '../content/world/serverSource';
import type { World } from '../world/World';
import type { StoreActors } from '../entity/data/storeActors';
import type Server from '../Server';
import { ChunkCompletionQueue } from '../world/ChunkCompletionQueue';
import { stub } from './stub.test.helper';

/** @see {@link testContent} */
let sharedContent: ServerContent | undefined;

/**
 * The two-block fixture build every server double answers, built on first use.
 *
 * A real server always has content, so a double that reports none describes a server that
 * cannot exist. Building the fixture per test would cost the stack's resolve each time for an
 * object almost no test reads, so one build is shared; nothing mutates a resolved
 * `ServerContent`.
 *
 * @returns {ServerContent} The shared fixture build.
 */
export const testContent = (): ServerContent => (sharedContent ??= buildServerContent(fixtureContentOptions()));

/**
 * A runtime that holds no entity and saves none.
 *
 * A `World` can ask it to tick, save, restore, or route a legacy body. It has no actors, and
 * an unknown legacy body stays with the world. A test about the data path builds a real runtime
 * and passes it.
 *
 * @returns {LiveEntityRuntime} The inert runtime.
 */
export const inertEntityRuntime = (): LiveEntityRuntime =>
    stub<LiveEntityRuntime>({
        // The fixture build, so a caller that asks the runtime what the stack declares - which
        // is what `/summon` does before it spawns - gets an answer rather than a crash. The
        // fixture declares no entity, so every such question answers no.
        // A real index, empty, so a world double files its entities somewhere it can ask again.
        runtime: stub<EntityRuntime>({ content: () => testContent(), blockBroken: () => {}, index: new EntityIndex() }),
        actors: stub<StoreActors>({ all: () => [][Symbol.iterator](), actorOf: () => undefined }),
        // Nothing it holds rides anything, so nothing is kept out of a portal.
        isInRide: () => false,
        onEntityRemoved: () => () => false,
        tick: async () => {},
        persist: () => {},
        savedRecords: () => new Map(),
        restore: () => undefined,
        restoreExisting: () => undefined,
        // Holds no data-driven entity, so every blow stays with the caller's own entity.
        damageEntity: () => undefined,
        killEntity: () => undefined
    });

/** What a test says about the server behind its world. */
export interface TestEntityServerOptions {
    /**
     * The built content, which the enchantment and loot steps read.
     *
     * Left out, and the server answers the two-block fixture build, because a real server
     * always has content and no path still handles its absence.
     */
    readonly content?: ServerContent;
    /**
     * The data-driven entities of the double's dimension.
     *
     * Left out, and the double answers an inert runtime that holds nothing. `World.saveChunks`
     * and `World.loadChunk` both ask, so a world double that saves or loads a chunk reaches
     * this whether or not the test is about entities at all.
     */
    readonly entityRuntime?: LiveEntityRuntime;
    /** The difficulty the config reports, which the damage scaling reads. */
    readonly difficulty?: Difficulty;
    /** The tick the server reports, which timed effects are measured against. */
    readonly tick?: number;
    /** The chance every roll draws, fixed so a test can state the outcome it wants. */
    readonly chance?: number;
    /** Receives everything written to the server log, in order. */
    readonly logged?: string[];
}

/**
 * A server with nothing behind it, for an entity to reach through its world.
 *
 * Every member is inert: the events go nowhere, the log goes to the array the caller passed or
 * nowhere, and the clock does not move. A test that needs one of them to do something replaces
 * it on the object this returns.
 *
 * @example
 * ```typescript
 * const world = stub<World>({ getName: () => 'test', getServer: () => testEntityServer() });
 * ```
 */
export const testEntityServer = (options: TestEntityServerOptions = {}): Server => {
    // One queue per double, as a real server has one. It is never activated, so a chunk's
    // lighting completes inline rather than waiting for a ticker that no test runs.
    const chunkCompletionQueue = new ChunkCompletionQueue();
    // One for the life of the double, as a real server keeps one per dimension: the world files
    // an entity in this runtime's index on arrival and asks the same index where it went.
    const entityRuntime = options.entityRuntime ?? inertEntityRuntime();
    return stub<Server>({
        // The listener count, which is what the emitter answers and nothing here reads.
        post: () => 0,
        getTick: () => options.tick ?? 0,
        getRandom: () => () => options.chance ?? 0.5,
        getContent: () => options.content ?? testContent(),
        getEntityRuntime: () => entityRuntime,
        getChunkCompletionQueue: () => chunkCompletionQueue,
        getConfig: () =>
            stub<Config>({
                getDifficulty: () => options.difficulty ?? Difficulty.NORMAL
            }),
        getLogger: () =>
            stub<Logger>({
                verbose: (...message) => void options.logged?.push(String(message[0])),
                debug: (...message) => void options.logged?.push(String(message[0])),
                info: (...message) => void options.logged?.push(String(message[0])),
                warn: (...message) => void options.logged?.push(String(message[0])),
                error: (...message) => void options.logged?.push(String(message[0]))
            })
    });
};

/** The fixture content wired to a live world, with the entity runtimes its build opened. */
export interface LiveTestEntities {
    /** The fixture build, built on first ask around the world. */
    content(): ServerContent;
    /** One dimension's runtime, which turns a drop into a store stack; inert when none opened. */
    entityRuntime(dimension: string): LiveEntityRuntime;
}

/**
 * The fixture content built around a live world, through real entity runtimes.
 *
 * A world whose server answers {@link inertEntityRuntime} drops nothing: a dropped stack is a
 * store entity, and the inert runtime has no store. A test that drops something answers these
 * two instead, read at call time because the world and the content each read the other.
 *
 * @param world - The live world of every dimension, read at call time.
 * @returns {LiveTestEntities} The content and the runtimes.
 */
export const liveTestEntities = (world: () => World | undefined): LiveTestEntities => {
    const entityRuntimes = new EntityRuntimes();
    let built: ServerContent | undefined;
    const content = (): ServerContent =>
        (built ??= buildServerContent(
            fixtureContentOptions({
                world: serverWorldSource({
                    worldFor: () => world(),
                    content: () => {
                        if (built === undefined) throw new Error('the content was read before it was built');
                        return built;
                    },
                    seed: 0n,
                    difficulty: () => Difficulty.NORMAL,
                    entityRuntimes
                })
            })
        ));
    return {
        content,
        entityRuntime: (dimension) => {
            content();
            return entityRuntimes.at(dimension) ?? inertEntityRuntime();
        }
    };
};
