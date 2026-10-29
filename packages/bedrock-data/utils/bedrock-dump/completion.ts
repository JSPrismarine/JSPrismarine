/**
 * Decides when the reference region has finished generating.
 *
 * Nothing the Script API exposes says when a chunk is fully generated: `createTickingArea`
 * resolves on registration and `dimension.getBlock` answers for a chunk the generator has barely
 * started on. The saved database does say — each chunk carries a finalized-state record, `2`
 * once generation and population are done — so the host flushes the world and reads it back.
 * This module is the engine-free half of that loop: which chunks a set of tiles must have
 * finished, whether to keep waiting, and how to report what is missing. `run.ts` drives it
 * against the real save; the unit tests drive it with a finalized-state double.
 */
import { chunksOf } from './region.ts';
import type { ReferenceRegion } from './region.ts';

/** A chunk the save does not hold fully generated: its coordinate and the state it is stuck at. */
export interface PendingChunk {
    /** Chunk x. */
    x: number;
    /** Chunk z. */
    z: number;
    /** The saved finalized state, or null when the chunk has no record at all. */
    state: number | null;
}

/** Finalized state of a chunk whose generation and population both finished. */
export const FULLY_GENERATED = 2;

/**
 * Milliseconds between two flush-and-verify rounds. The engine generates ticking-area chunks on
 * a throttle of a few chunks per second at best, so polling faster than this reads the same
 * numbers back and holds the save for nothing.
 */
export const VERIFY_INTERVAL_MS = 15_000;

/**
 * The chunks of the given tiles the save does not hold fully generated.
 *
 * @param tiles - The tiles whose chunks must be done, usually a prefix of the region's tiling.
 * @param stateOf - Reads a chunk's saved finalized state; null when the chunk has no record.
 * @returns Pending chunks in tile order, row-major with x fastest within each tile.
 */
export const pendingChunks = (
    tiles: readonly ReferenceRegion[],
    stateOf: (x: number, z: number) => number | null
): PendingChunk[] => {
    const pending: PendingChunk[] = [];
    for (const tile of tiles) {
        for (const { x, z } of chunksOf(tile)) {
            const state = stateOf(x, z);
            if (state !== FULLY_GENERATED) pending.push({ x, z, state });
        }
    }
    return pending;
};

/** What the generation loop should do next. */
export type SessionVerdict = 'done' | 'wait' | 'restart' | 'timeout';

/**
 * Polls with no progress before a session is stopped and the save verified offline.
 *
 * The count a live poll reads is a lower bound — the engine serializes loaded chunks on its own
 * slow cadence — so a stall means "a clean stop will tell", not "generation failed". A restart
 * costs a whole boot, so the patience here is minutes, not seconds.
 */
export const STAGNANT_POLLS_PER_SESSION = 8;

/**
 * Whether to finish, keep polling, stop the session and verify offline, or give up.
 *
 * @param pendingCount - Chunks the save does not hold fully generated, per the latest poll.
 * @param elapsedMs - Milliseconds the whole pass has spent generating so far.
 * @param budgetMs - Milliseconds the pass may take before it fails.
 * @param stagnantPolls - Consecutive polls whose pending count did not shrink.
 * @param maxStagnantPolls - Stagnant polls a session may accumulate before it is restarted.
 */
export const sessionVerdict = (
    pendingCount: number,
    elapsedMs: number,
    budgetMs: number,
    stagnantPolls: number,
    maxStagnantPolls = STAGNANT_POLLS_PER_SESSION
): SessionVerdict => {
    if (pendingCount === 0) return 'done';
    if (elapsedMs >= budgetMs) return 'timeout';
    return stagnantPolls >= maxStagnantPolls ? 'restart' : 'wait';
};

/**
 * Expected-versus-actual counts and the missing chunk coordinates, for progress lines and for
 * the error a timeout raises.
 *
 * @param pending - The chunks still unfinished.
 * @param total - Chunks the verified tiles hold.
 * @param limit - Coordinates to list before truncating.
 */
export const describePending = (pending: readonly PendingChunk[], total: number, limit = 12): string => {
    const listed = pending
        .slice(0, limit)
        .map(({ x, z, state }) => `${x},${z}${state === null ? '' : `(state ${state})`}`)
        .join(' ');
    const more = pending.length > limit ? ` (+${pending.length - limit} more)` : '';
    return `${total - pending.length} of ${total} chunks fully generated; pending ${pending.length}: ${listed}${more}`;
};
