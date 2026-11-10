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
        path: 'player landing check for a soft block',
        file: 'Player.ts',
        call: 'private async isStandingInSomethingSoft()',
        slice: 5
    },
    {
        // A death files the search and the next input step awaits its answer
        // (`world/RespawnRequests.ts`), and the `Respawn` handler still searches as it runs.
        path: 'player respawn search, awaited by the input step that answers a death',
        file: 'world/RespawnSearch.ts',
        call: 'isObstructed: async (x, y, z) => (await world.getBlock(x, y, z)).isSolid()',
        slice: 9
    },
    {
        path: 'dragon fight arena, gateway and pillar chunks',
        file: 'world/end/DragonFight.ts',
        call: 'this.world.getChunkAt(',
        slice: 9
    },
    {
        path: 'portal travel loading the arrival chunks',
        file: 'world/portal/DimensionTravel.ts',
        call: 'loads.push(world.getChunk(cx, cz))',
        slice: 9
    },
    {
        path: '`World.setBlockRuntimeId` on a chunk that is not loaded',
        file: 'world/World.ts',
        call: '?? (await this.getChunkAt(x, z))',
        slice: 9
    },
    {
        path: 'input-lane handlers that read a block, such as `PlayerAction`',
        file: 'network/handler/PlayerActionHandler.ts',
        call: 'await world.getBlock(',
        slice: 6
    }
];
