import { availableParallelism } from 'node:os';

/**
 * Cores left to the server's own thread when chunk generation sizes its worker pool.
 *
 * One, because the generation process runs at a lowered priority and its workers yield to the
 * server thread, and because the pool keeps a worker clear for a waiting player by itself. The
 * other threads the server runs, networking and storage, spend most of their time waiting.
 */
export const RESERVED_CORES = 1;

/**
 * How many workers to use for chunk generation on this host: every core but the server's.
 *
 * Zero on a single-core host, where generation runs on the server thread. Callers that need a
 * positive task depth should clamp the result to one.
 */
export const chunkWorkerCount = (): number => Math.max(0, availableParallelism() - RESERVED_CORES);
