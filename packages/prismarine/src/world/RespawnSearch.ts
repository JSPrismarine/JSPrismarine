/**
 * Where a player who died comes back, asked and answered as plain data.
 *
 * The question used to be answered inside `Player`, which built other dimensions and read their
 * blocks from inside `onDeath`, and so from inside `damage`. The search belongs to the level,
 * because it reads worlds the player is not in: a bed in another dimension of the player's level,
 * and the default level's Overworld spawn. {@link RespawnSearch} holds every world read the
 * search makes, chunk loads and dimension builds included, and its request and answer hold no
 * world or entity object, so the request can be sent from a tick and the answer admitted as an
 * input of a later one under ADR 0009 and ADR 0011.
 */
import { Vector3 } from '@jsprismarine/math';

import { dimensionByName } from './DimensionType';
import { resolveRespawn } from './RespawnPoint';
import type { StoredSpawnPoint } from './RespawnPoint';
import { clearRespawnFeet, respawnPoint } from './SpawnPlacement';
import type { BodyBox } from './SpawnPlacement';
import type { World } from './World';

/** A position as plain numbers. */
export interface RespawnPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** What a respawn search is asked. */
export interface RespawnRequest {
    /** The player's key; see `keyOfPlayer`. The answer carries it back. */
    readonly player: string;
    /** The player's own spawn point, from a bed, an anchor or `/spawnpoint`, or undefined for none. */
    readonly spawnPoint: StoredSpawnPoint | undefined;
    /** The player's body: the box that has to fit at the world spawn, and the eye height above the feet. */
    readonly body: BodyBox & { readonly eyeHeight: number };
}

/** Where the search says the player comes back. */
export interface RespawnAnswer {
    /** The key the request named. */
    readonly player: string;
    /**
     * Which spawn it is: `own` is the player's spawn point, in its dimension of the level the
     * search belongs to, and `world` is the world spawn, in the default level's Overworld.
     */
    readonly spawn: 'own' | 'world';
    /** The id of the dimension the position is in, such as `minecraft:the_nether`. */
    readonly dimension: string;
    /** The three positions the respawn exchange sends; see `respawnPoint`. */
    readonly announced: RespawnPosition;
    readonly block: RespawnPosition;
    readonly eyes: RespawnPosition;
    /**
     * Whether the player's own spawn point stopped holding: the bed or anchor is gone or has
     * nowhere free beside it, or names a dimension the level has no stem for. The player clears
     * it and is told, so the next death goes straight to the world spawn.
     */
    readonly spawnPointLost: boolean;
}

/** The worlds a search reads, which is where the chunk loads happen. */
export interface RespawnWorlds {
    /** Whether the level the search belongs to has a stem of that id. */
    hasStem(stemId: string): boolean;
    /** The level's world of a stem, built and enabled when nobody has been there since the save opened. */
    world(stemId: string): Promise<World>;
    /** The world the world spawn is in: the default level's Overworld. */
    worldSpawn(): World;
}

/** The plain form of a position. */
const plain = (position: Vector3): RespawnPosition => ({
    x: position.getX(),
    y: position.getY(),
    z: position.getZ()
});

/** The three respawn positions over a block, as plain data. */
const exchangeAt = (block: Vector3, eyeHeight: number) => {
    const point = respawnPoint(block, eyeHeight);
    return { announced: plain(point.announced), block: plain(point.block), eyes: plain(point.eyes) };
};

/**
 * One level's respawn search.
 *
 * The rules are Java's `findRespawnPositionAndUseSpawnBlock`. A player's own spawn point is used
 * when it still holds, in the dimension it was set in, which need not be the one they died in.
 * Otherwise they come back at the Overworld spawn of the default level, Java's
 * `server.overworld()`, raised out of whatever their body overlaps there.
 */
export class RespawnSearch {
    public constructor(private readonly worlds: RespawnWorlds) {}

    /**
     * Finds where a player comes back.
     *
     * Reads blocks and may load chunks or build a dimension, so it awaits. Writes nothing: a
     * spawn point that stopped holding is reported in the answer, not cleared.
     * @param request - Who is asking, their spawn point and their body.
     */
    public async find(request: RespawnRequest): Promise<RespawnAnswer> {
        const { player, spawnPoint, body } = request;

        // A point a bed, an anchor or `/spawnpoint` set is already resolved to where a body
        // stands: free of blocks, or forced where it was put.
        if (spawnPoint !== undefined) {
            const own = await this.resolveOwnSpawn(spawnPoint);
            if (own !== undefined) {
                return {
                    player,
                    spawn: 'own',
                    dimension: own.stemId,
                    ...exchangeAt(own.position, body.eyeHeight),
                    spawnPointLost: false
                };
            }
        }

        // The world spawn is only a block, and the ground on a world that stored it as the top
        // block, so it is raised out of whatever this player's body overlaps there: the body is
        // theirs, and so is how far the eyes sit above the feet.
        const world = this.worlds.worldSpawn();
        const spawn = await world.getSpawnPosition();
        const { minY, height } = world.getDimension();
        const feet = await clearRespawnFeet(
            spawn,
            {
                maxY: minY + height,
                // Air is the common answer, and settles it without building the block.
                isObstructed: async (x, y, z) =>
                    (await world.getBlockState(x, y, z)).name !== 'minecraft:air' &&
                    (await world.getBlock(x, y, z)).isSolid()
            },
            body
        );

        return {
            player,
            spawn: 'world',
            dimension: world.getDimension().id,
            ...exchangeAt(new Vector3(spawn.getX(), feet, spawn.getZ()), body.eyeHeight),
            spawnPointLost: spawnPoint !== undefined
        };
    }

    /**
     * A spawn point as a position in the dimension it names, or undefined when it no longer holds.
     *
     * The world is built if the level has not built that dimension yet: the bed is still there
     * whether or not anybody has been near it since the save opened. A point naming a dimension
     * the level has no stem for is treated as a bed that is gone.
     */
    private async resolveOwnSpawn(spawn: StoredSpawnPoint): Promise<{ stemId: string; position: Vector3 } | undefined> {
        // The record keeps the client's spelling, `minecraft:nether`; the level keys its stems
        // by the Java one. A custom dimension spells both the same.
        const stemId = dimensionByName(spawn.dimension)?.id ?? spawn.dimension;
        if (!this.worlds.hasStem(stemId)) return undefined;

        const world = await this.worlds.world(stemId);
        const { minY, height } = world.getDimension();
        const resolved = await resolveRespawn(spawn, {
            minY,
            maxY: minY + height,
            isObstructed: async (x, y, z) => (await world.getBlock(x, y, z)).isSolid(),
            getBlockName: async (x, y, z) => (await world.getBlockState(x, y, z)).name
        });

        return resolved.kind === 'honored' ? { stemId, position: resolved.position } : undefined;
    }
}
