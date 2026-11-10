import type { Module } from '@jsprismarine/kernel';

import { finishStartupPhase, startStartupPhase } from '../profiling/startupPhase';
import type ChunkScheduler from '../world/ChunkScheduler';
import type WorldManager from '../world/WorldManager';
import { contentToken, tickerToken, worldsToken } from './tokens';

/**
 * Tears the worlds down: the chunk deliveries first, so a chunk still generating does not land
 * in a world mid-teardown, then the worlds.
 */
const closeWorlds = async (worlds: WorldManager, chunks: ChunkScheduler): Promise<void> => {
    await chunks.close();
    await worlds.disable();
};

/**
 * Provides the {@link WorldManager} as `prismarine:worlds`. Starting the module loads the default
 * level and generates its start region, which can take minutes; stopping it drains the chunk
 * deliveries and closes every world.
 *
 * It depends on the content build, which its worlds generate and tick against, and on the
 * ticker: the preload lights each background chunk through the completion queue the tick drains,
 * and waits for it, so without a running tick the start region never finishes. A start that
 * fails tears down what it opened before rethrowing, because the kernel only stops modules whose
 * start finished.
 *
 * @param worlds - The world manager.
 * @param chunks - The scheduler that feeds chunks to players.
 * @returns The module to register on the kernel.
 */
export const worldsModule = (worlds: WorldManager, chunks: ChunkScheduler): Module => ({
    id: 'prismarine:worlds',
    dependencies: [contentToken, tickerToken],
    register: (ctx) => {
        ctx.provide(worldsToken, worlds);
    },
    start: async () => {
        const startedAt = startStartupPhase();
        try {
            await worlds.enable();
        } catch (error: unknown) {
            await closeWorlds(worlds, chunks);
            throw error;
        }
        finishStartupPhase('world-manager-enable', startedAt);
    },
    stop: () => closeWorlds(worlds, chunks)
});
