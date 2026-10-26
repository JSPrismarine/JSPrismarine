import { availableParallelism } from 'node:os';

/** Cores to leave available for the server, networking, and storage. */
const RESERVED_CORES = 2;

/** The most workers measured to help whole-chunk generation. */
const MAX_CHUNK_WORKERS = 6;

/**
 * How many workers to use for chunk generation on this host.
 *
 * A negative result means the host has too few cores to reserve server capacity and start a
 * worker. Callers that need a positive task depth should clamp the result to one.
 */
export const chunkWorkerCount = (): number => Math.min(MAX_CHUNK_WORKERS, availableParallelism() - RESERVED_CORES);
