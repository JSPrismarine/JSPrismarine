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
import type Server from '../Server';
import { stub } from './stub.test.helper';

/** What a test says about the server behind its world. */
export interface TestEntityServerOptions {
    /**
     * The built content, which the enchantment and loot steps read.
     *
     * Left out, and the server reports none, which is what a server with `content-packs` off
     * reports and what every path that reads it already handles.
     */
    readonly content?: ServerContent;
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
export const testEntityServer = (options: TestEntityServerOptions = {}): Server =>
    stub<Server>({
        // The listener count, which is what the emitter answers and nothing here reads.
        post: () => 0,
        getTick: () => options.tick ?? 0,
        getRandom: () => () => options.chance ?? 0.5,
        getContent: () => options.content,
        // No data-driven runtime, which is the shape of a server with `content-packs` off.
        // `World.saveChunks` and `World.loadChunk` both ask, so a world double that saves or
        // loads a chunk reaches this whether or not the test is about entities at all.
        getEntityRuntime: () => undefined,
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
