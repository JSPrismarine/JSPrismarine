/**
 * One path that loads a chunk from inside a tick and waits for it.
 *
 * Such a chunk cannot wait for the next input step, because the tick that waits for it would
 * never end, so the admission queue applies it the moment it is ready and counts it as admitted
 * in the tick ({@link ChunkAdmissionSnapshot.admittedInTick}). Each one breaks the rule of
 * [ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md) until the slice
 * named for it reads loaded chunks only, takes a chunk ticket or turns the wait into a message.
 */
export interface InTickChunkLoad {
    /** What loads the chunk. */
    readonly path: string;
    /** The source file under `packages/prismarine/src`. */
    readonly file: string;
    /** Text the file holds at the call that loads the chunk, so the entry fails once it is gone. */
    readonly call: string;
    /** The plan slice that removes it. */
    readonly slice: number;
}

/**
 * The paths that still load a chunk from inside a tick, as of the change that made chunk
 * completions inputs. Remove an entry with the code it names; a test reports how many are left.
 */
export const IN_TICK_CHUNK_LOADS: readonly InTickChunkLoad[] = [
    {
        // A death and a respawn file requests whose searches read loaded chunks only and wait
        // with a ticket (`world/RespawnRequests.ts`). Portal travel out of the End still awaits
        // the search, which then loads what it lacks; E2's travel as messages removes it.
        path: 'respawn search awaited by portal travel out of the End',
        file: 'world/RespawnSearch.ts',
        call: 'loads.push(world.getChunk(x, z))',
        slice: 9
    }
];
