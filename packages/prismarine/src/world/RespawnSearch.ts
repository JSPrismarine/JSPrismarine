/**
 * Where a player who died comes back, asked and answered as plain data.
 *
 * The question used to be answered inside the player's death, which built other dimensions and
 * read their blocks from inside `onDeath`, and so from inside `damage`. The search belongs to
 * the level, because it reads worlds the player is not in: a bed in another dimension of the
 * player's level, and the default level's Overworld spawn. {@link RespawnSearch} holds every
 * world read the search makes, chunk loads and dimension builds included, and its request and
 * answer hold no world or entity object, so the request can be sent from a tick and the answer admitted as an
 * input of a later one under ADR 0009 and ADR 0011.
 */
import { Vector3 } from '@jsprismarine/math';

import type { ChunkCoordinate } from './ChunkTickets';
import { dimensionByName } from './DimensionType';
import { resolveRespawn } from './RespawnPoint';
import type { StoredSpawnPoint } from './RespawnPoint';
import { clearRespawnFeet, respawnPoint } from './SpawnPlacement';
import type { BodyBox } from './SpawnPlacement';
import { outsideTick } from './TickContext';
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
    /**
     * The spawn point the search examined, the request's. A player who set another one while
     * the search waited keeps it.
     */
    readonly spawnPoint: StoredSpawnPoint | undefined;
}

/** The worlds a search reads. */
export interface RespawnWorlds {
    /** Whether the level the search belongs to has a stem of that id. */
    hasStem(stemId: string): boolean;
    /** The level's world of a stem, built and enabled when nobody has been there since the save opened. */
    world(stemId: string): Promise<World>;
    /** The level's world of a stem if it is built and enabled, without building it. */
    built(stemId: string): World | undefined;
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

/** What one attempt found missing, which it has to wait for before its answer counts. */
class Lacks {
    /** Chunks not in memory, by the world they belong to. */
    public readonly chunks = new Map<World, Map<string, ChunkCoordinate>>();
    /** Stems whose world has not been built. */
    public readonly worlds = new Set<string>();
    /** Worlds that do not know their spawn yet. */
    public readonly spawns = new Set<World>();

    public get any(): boolean {
        return this.chunks.size > 0 || this.worlds.size > 0 || this.spawns.size > 0;
    }

    /**
     * The name of the block state at a position, or undefined with its chunk recorded when the
     * chunk is not in memory.
     */
    public nameAt(world: World, x: number, y: number, z: number): string | undefined {
        const block = world.loadedBlockAt(x, y, z);
        if (block !== undefined) return block.name;
        // Outside the dimension's height there is nothing to load, and nothing stands.
        const { minY, height } = world.getDimension();
        if (y < minY || y >= minY + height) return 'minecraft:air';

        const missing = this.chunks.get(world) ?? new Map<string, ChunkCoordinate>();
        missing.set(`${x >> 4},${z >> 4}`, { x: x >> 4, z: z >> 4 });
        this.chunks.set(world, missing);
        return undefined;
    }

    /** Whether the block at a position is solid; false, with its chunk recorded, when the chunk is not in memory. */
    public isSolid(world: World, x: number, y: number, z: number): boolean {
        if (this.nameAt(world, x, y, z) === undefined) return false;
        return world.loadedBlock(x, y, z)?.isSolid() ?? false;
    }
}

/** What an attempt says: the answer, or that it waits for something it has asked for. */
export type RespawnAttempt = { readonly kind: 'answer'; readonly answer: RespawnAnswer } | { readonly kind: 'waiting' };

/**
 * One level's respawn search.
 *
 * The rules are Java's `findRespawnPositionAndUseSpawnBlock`. A player's own spawn point is used
 * when it still holds, in the dimension it was set in, which need not be the one they died in.
 * Otherwise they come back at the Overworld spawn of the default level, Java's
 * `server.overworld()`, raised out of whatever their body overlaps there.
 */
export class RespawnSearch {
    /** The chunks each player's waiting attempts have ticketed so far, by world and `x,z` key. */
    private readonly ticketed = new Map<string, Map<World, Map<string, ChunkCoordinate>>>();
    /** Builds an attempt started, by stem, with how each ended once it has. */
    private readonly building = new Map<string, { failed?: unknown }>();

    public constructor(private readonly worlds: RespawnWorlds) {}

    /**
     * Tries to find where a player comes back, from what the worlds have loaded, without waiting.
     *
     * When something is missing, the attempt asks for it and says it is waiting: a chunk through
     * a ticket held in the player's name, a world or a world spawn by starting its build outside
     * the tick. Asking again once it has arrived answers. Writes nothing to the world: a spawn
     * point that stopped holding is reported in the answer, not cleared.
     * @param request - Who is asking, their spawn point and their body.
     * @throws When a world the attempt started building failed to build.
     */
    public attempt(request: RespawnRequest): RespawnAttempt {
        const lacks = new Lacks();
        const answer = this.search(request, lacks);
        if (answer !== undefined && !lacks.any) {
            this.release(request.player);
            return { kind: 'answer', answer };
        }

        try {
            for (const stemId of lacks.worlds) this.build(stemId);
        } catch (error: unknown) {
            this.release(request.player);
            throw error;
        }
        const owner = `respawn:${request.player}`;
        for (const [world, chunks] of lacks.chunks) {
            // Every chunk the search has asked for in this world, not only the ones this attempt
            // lacked: a request replaces the owner's ticket, and an attempt that reads further
            // than the last one would otherwise let go of the chunks it already read. A chunk let
            // go of can unload before the next attempt, which then lacks it again, and a bed on a
            // chunk border alternates between its two chunks without ever answering. The set
            // only grows by chunks the search reads, so it stays as small as the search.
            const held = this.ticketed.get(request.player) ?? new Map<World, Map<string, ChunkCoordinate>>();
            const asked = held.get(world) ?? new Map<string, ChunkCoordinate>();
            for (const [key, chunk] of chunks) asked.set(key, chunk);
            held.set(world, asked);
            this.ticketed.set(request.player, held);
            world.chunkTickets().request(owner, asked.values());
        }
        for (const world of lacks.spawns) {
            outsideTick(() => {
                world.getSpawnPosition().catch(() => undefined);
            });
        }
        return { kind: 'waiting' };
    }

    /**
     * Gives up the chunk tickets a player's waiting attempts took, in every world. An answer does
     * this itself; a caller that stops asking before the answer, such as a trip that is dropped,
     * calls it. Releasing a player with no waiting search does nothing.
     * @param player - The key the requests named.
     */
    public release(player: string): void {
        for (const world of this.ticketed.get(player)?.keys() ?? []) world.chunkTickets().release(`respawn:${player}`);
        this.ticketed.delete(player);
    }

    /** Starts building a stem's world outside the tick, once, and remembers how it ended. */
    private build(stemId: string): void {
        const known = this.building.get(stemId);
        if (known !== undefined) {
            if ('failed' in known) {
                this.building.delete(stemId);
                throw known.failed;
            }
            return;
        }

        const entry: { failed?: unknown } = {};
        this.building.set(stemId, entry);
        outsideTick(() => {
            this.worlds.world(stemId).then(
                () => {
                    if (this.building.get(stemId) === entry) this.building.delete(stemId);
                },
                (error: unknown) => {
                    entry.failed = error;
                }
            );
        });
    }

    /**
     * The search itself, over loaded chunks, recording in `lacks` whatever it could not read.
     * An answer found while something lacked is a guess and does not count.
     */
    private search(request: RespawnRequest, lacks: Lacks): RespawnAnswer | undefined {
        const { player, spawnPoint, body } = request;

        // A point a bed, an anchor or `/spawnpoint` set is already resolved to where a body
        // stands: free of blocks, or forced where it was put.
        if (spawnPoint !== undefined) {
            const own = this.resolveOwnSpawn(spawnPoint, lacks);
            // Whether the point holds is not known until its world and chunks are in.
            if (lacks.any) return undefined;
            if (own !== undefined) {
                return {
                    player,
                    spawn: 'own',
                    dimension: own.stemId,
                    ...exchangeAt(own.position, body.eyeHeight),
                    spawnPointLost: false,
                    spawnPoint
                };
            }
        }

        // The world spawn is only a block, and the ground on a world that stored it as the top
        // block, so it is raised out of whatever this player's body overlaps there: the body is
        // theirs, and so is how far the eyes sit above the feet.
        const world = this.worlds.worldSpawn();
        const spawn = world.getKnownSpawnPosition();
        if (spawn === null) {
            lacks.spawns.add(world);
            return undefined;
        }
        const { minY, height } = world.getDimension();
        const feet = clearRespawnFeet(
            spawn,
            {
                maxY: minY + height,
                // Air is the common answer, and settles it without building the block.
                isObstructed: (x, y, z) => {
                    const name = lacks.nameAt(world, x, y, z);
                    return name !== undefined && name !== 'minecraft:air' && lacks.isSolid(world, x, y, z);
                }
            },
            body
        );

        return {
            player,
            spawn: 'world',
            dimension: world.getDimension().id,
            ...exchangeAt(new Vector3(spawn.getX(), feet, spawn.getZ()), body.eyeHeight),
            spawnPointLost: spawnPoint !== undefined,
            spawnPoint
        };
    }

    /**
     * A spawn point as a position in the dimension it names, or undefined when it no longer holds.
     *
     * The world is built if the level has not built that dimension yet: the bed is still there
     * whether or not anybody has been near it since the save opened. A point naming a dimension
     * the level has no stem for is treated as a bed that is gone.
     */
    private resolveOwnSpawn(spawn: StoredSpawnPoint, lacks: Lacks): { stemId: string; position: Vector3 } | undefined {
        // The record keeps the client's spelling, `minecraft:nether`; the level keys its stems
        // by the Java one. A custom dimension spells both the same.
        const stemId = dimensionByName(spawn.dimension)?.id ?? spawn.dimension;
        if (!this.worlds.hasStem(stemId)) return undefined;

        const world = this.worlds.built(stemId);
        if (world === undefined) {
            lacks.worlds.add(stemId);
            return undefined;
        }
        const { minY, height } = world.getDimension();
        const resolved = resolveRespawn(spawn, {
            minY,
            maxY: minY + height,
            isObstructed: (x, y, z) => lacks.isSolid(world, x, y, z),
            getBlockName: (x, y, z) => lacks.nameAt(world, x, y, z) ?? 'minecraft:air'
        });

        return resolved.kind === 'honored' ? { stemId, position: resolved.position } : undefined;
    }
}
