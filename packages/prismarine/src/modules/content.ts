import type { Module } from '@jsprismarine/kernel';

import type { ContentSource } from './tokens';
import { contentToken } from './tokens';

/** What starting and stopping the content build does, which only the server can reach. */
export interface ContentLifecycle {
    /** Builds the content registries from the pack stack and the payloads a join sends. */
    build(): void;
    /** Closes the data-driven entity runtimes the build created. */
    close(): void;
}

/**
 * Provides the content build as `prismarine:content`. Starting the module builds the registries
 * from the pack stack; stopping it closes the entity runtimes. Every module that reads blocks,
 * items, entities or recipes depends on it, so it stops after all of them: a world saves through
 * its dimension's runtime as it closes, and the runtime has to outlive it.
 *
 * @param source - Where the current build is read from.
 * @param lifecycle - Builds and closes the content.
 * @returns The module to register on the kernel.
 */
export const contentModule = (source: ContentSource, lifecycle: ContentLifecycle): Module => ({
    id: 'prismarine:content',
    register: (ctx) => {
        ctx.provide(contentToken, source);
    },
    start: () => lifecycle.build(),
    stop: () => lifecycle.close()
});
