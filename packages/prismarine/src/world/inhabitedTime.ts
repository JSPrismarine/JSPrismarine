/**
 * Chunk inhabited time, transcribed from Java's `ServerChunkCache.tickChunks`.
 *
 * Every tick the world runs, each loaded chunk a player ticket simulates and a player is close
 * enough to for spawning (`ChunkMap.anyPlayerCloseEnoughForSpawning`) counts one tick more
 * (`ServerChunkCache.tickSpawningChunk` calls `LevelChunk.incrementInhabitedTime`). Regional
 * difficulty reads the count where a mob spawns, so a chunk players live in grows harder.
 *
 * @javaSee ServerChunkCache.tickChunks()V
 */

/**
 * `ChunkMap.playerIsCloseEnoughForSpawning`: a player within 128 blocks of the chunk's middle block
 * column, measured on x and z (`euclideanDistanceSquared < 16384`).
 */
export const SPAWNING_REACH = 128;

/** One player as the count reads it: where it stands, and whether it is a spectator, which never counts. */
export interface InhabitingPlayer {
    readonly x: number;
    readonly z: number;
    readonly spectator: boolean;
}

/** A chunk whose inhabited time the count advances. */
export interface InhabitedChunk {
    getX(): number;
    getZ(): number;
    incrementInhabitedTime(): void;
}

/** Whether a player that counts stands within {@link SPAWNING_REACH} of a chunk's middle. */
export const playerCloseEnoughForSpawning = (
    chunkX: number,
    chunkZ: number,
    players: readonly InhabitingPlayer[]
): boolean => {
    const middleX = chunkX * 16 + 8;
    const middleZ = chunkZ * 16 + 8;
    return players.some((player) => {
        if (player.spectator) return false;
        const dx = middleX - player.x;
        const dz = middleZ - player.z;
        return dx * dx + dz * dz < SPAWNING_REACH * SPAWNING_REACH;
    });
};

/**
 * Counts one tick of inhabited time in each of `chunks` a player is close enough to for spawning.
 *
 * @param chunks - The chunks the world simulates this tick.
 * @param players - The world's players.
 */
export const tickInhabitedTime = (chunks: Iterable<InhabitedChunk>, players: readonly InhabitingPlayer[]): void => {
    if (!players.some((player) => !player.spectator)) return;
    for (const chunk of chunks)
        if (playerCloseEnoughForSpawning(chunk.getX(), chunk.getZ(), players)) chunk.incrementInhabitedTime();
};
