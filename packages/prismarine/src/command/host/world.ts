/**
 * The `world` group of the server's `CommandHost`.
 *
 * The block verbs write through `World.setLoadedBlockState`, which is the
 * synchronous path the engine systems already use, so a command never
 * generates terrain by naming a position: a region that reaches past the
 * loaded chunks is reported as the blocks that actually changed, which is what
 * Java does too.
 */
import type {
    BlockPlacementMode,
    BlockRef,
    EntityRef,
    Vector3 as HostVector,
    WorldCommandHost
} from '@jsprismarine/commands';
import { gameRule } from '@jsprismarine/commands';
import { Vector3 } from '@jsprismarine/math';

import { bedrockBiomeToJava } from '@jsprismarine/mapping';
import { Types } from '@jsprismarine/nbt';
import type { NBTTagCompound } from '@jsprismarine/nbt';

import type Server from '../../Server';
import { bedrockBlockEntityIdOf } from '../../blockentity/bedrockBlockEntityIds';
import { writeBlockEntity } from '../../blockentity/blockEntityWrite';
import { blockEntityCompound } from '../../blockentity/contentRecord';
import { DIFFICULTIES, difficultyName } from '../../config/Config';
import PlaySoundPacket from '@jsprismarine/protocol/bedrock/packet/PlaySoundPacket';
import SetDifficultyPacket from '@jsprismarine/protocol/bedrock/packet/SetDifficultyPacket';
import SetSpawnPositionPacket, {
    SpawnPositionType
} from '@jsprismarine/protocol/bedrock/packet/SetSpawnPositionPacket';
import SpawnParticleEffectPacket from '@jsprismarine/protocol/bedrock/packet/SpawnParticleEffectPacket';
import StopSoundPacket from '@jsprismarine/protocol/bedrock/packet/StopSoundPacket';
import type { World } from '../../world/World';
import type { Level } from '../../world/Level';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import {
    blockPositionOf,
    carryOut,
    dimensionInLevel,
    dimensionInLevelOf,
    loadedDimensions,
    playersOf,
    resolveTarget,
    sessionsOf,
    unsupported,
    worldOf
} from './support';
import { tickingAreaCommandHost } from './tickingAreas';
import assert from 'node:assert';

/**
 * The most blocks one `/fill` or `/clone` may touch.
 *
 * Java's `minecraft:max_block_modifications`, whose default this repository
 * records in `JAVA_GAME_RULES` as 32768. A bigger region is refused rather
 * than half-applied, because a command that stops in the middle leaves a shape
 * nobody asked for.
 */
const MAX_BLOCK_MODIFICATIONS = 32_768;

/**
 * How many random points `/spreadplayers` tries before giving up on one player.
 *
 * Java relaxes the whole set towards a solution; this draws until a draw is
 * far enough from the ones already placed, which answers the same question for
 * the handful of players a command names.
 */
const SPREAD_ATTEMPTS = 64;

/**
 * The name this server's `GameRuleManager` spells a Java gamerule id under.
 *
 * 1.21.11 renamed every rule from camelCase to a namespaced snake_case id, and
 * the client still matches the camelCase spelling, so the command layer speaks
 * Java's id and the world stores Bedrock's name. `gameRule` resolves either
 * onto the same rule and its `legacyNames` are the camelCase ones, which is
 * exactly what `GameRules` holds.
 *
 * @param name - The id or name a command wrote.
 * @returns The camelCase spelling, or the name unchanged when no rule matches.
 */
const serverGameRuleName = (name: string): string => gameRule(name)?.legacyNames[0] ?? name;

/**
 * What each biome id a chunk can hold is called.
 *
 * Read out of `@jsprismarine/mapping`'s generated registry table rather than written down, by
 * asking it about every id in Bedrock's range; the ids are Mojang's own numbering and are not
 * contiguous, so the ones it does not know are left out.
 */
const biomeNames = new Map<number, string>(
    Array.from({ length: 256 }, (_unused, id) => bedrockBiomeToJava(id)).flatMap((result) =>
        result.kind === 'unknown' ? [] : [[result.bedrock.id, result.bedrock.identifier] as const]
    )
);

/** The corners of a region, ordered so a loop can run low to high on each axis. */
const regionOf = (from: HostVector, to: HostVector) => {
    const low = blockPositionOf(from);
    const high = blockPositionOf(to);
    return {
        minX: Math.min(low.getX(), high.getX()),
        minY: Math.min(low.getY(), high.getY()),
        minZ: Math.min(low.getZ(), high.getZ()),
        maxX: Math.max(low.getX(), high.getX()),
        maxY: Math.max(low.getY(), high.getY()),
        maxZ: Math.max(low.getZ(), high.getZ())
    };
};

const regionSize = (region: ReturnType<typeof regionOf>): number =>
    (region.maxX - region.minX + 1) * (region.maxY - region.minY + 1) * (region.maxZ - region.minZ + 1);

/** Whether a position sits on the shell of a region, which is what `hollow` and `outline` keep. */
const onShell = (region: ReturnType<typeof regionOf>, x: number, y: number, z: number): boolean =>
    x === region.minX ||
    x === region.maxX ||
    y === region.minY ||
    y === region.maxY ||
    z === region.minZ ||
    z === region.maxZ;

const sameBlock = (left: BlockRef | undefined, right: BlockRef | undefined): boolean => {
    if (left === undefined || right === undefined) return left === right;
    if (left.identifier !== right.identifier) return false;
    const keys = new Set([...Object.keys(left.states), ...Object.keys(right.states)]);
    for (const key of keys) {
        if (String(left.states[key]) !== String(right.states[key])) return false;
    }
    return true;
};

/**
 * A state value in the form the block catalog stores it. A bit state such as `open_bit` is a byte,
 * and `BlockStateSchema.createState` writes `true` and `false` given for one as 1 and 0, so a
 * filter that spells it either way matches the block `/setblock` would have placed.
 */
const storedStateValue = (value: unknown): unknown => (typeof value === 'boolean' ? Number(value) : value);

/**
 * Whether a block is one a `/fill … replace` or `/clone … filtered` filter names: the same block,
 * with each state the filter lists present and set as it lists it. A state the filter leaves out
 * matches any value, so `replace minecraft:portal` finds a portal on either axis, as Bedrock and
 * Java both read a filter.
 */
const matchesFilter = (block: BlockRef | undefined, filter: BlockRef | undefined): boolean => {
    if (block === undefined || filter === undefined) return false;
    if (block.identifier !== filter.identifier) return false;
    return Object.entries(filter.states).every(
        ([key, wanted]) =>
            Object.hasOwn(block.states, key) &&
            String(storedStateValue(block.states[key])) === String(storedStateValue(wanted))
    );
};

/**
 * Builds the `world` group.
 *
 * @param server - The live server every verb reads and writes through.
 */
export const worldCommandHost = (
    server: Server,
    level: () => Level = () => server.getWorldManager().getEntryLevel()
): WorldCommandHost => {
    /** The level's Overworld, whose clock, weather and rules the level's commands read and set. */
    const levelWorld = () => level().loadedWorld(OVERWORLD_STEM_ID) ?? server.getWorldManager().getEntryWorld();
    /** The world of a dimension a command carries, in the host's level when it names none. */
    const worldIn = (dimension: string) => worldOf(server, dimensionInLevel(server, dimension, level()));

    const readBlock = (world: World, x: number, y: number, z: number): BlockRef | undefined => {
        const found = world.loadedBlockAt(x, y, z);
        return found === undefined ? undefined : { identifier: found.name, states: found.states };
    };

    /**
     * One block write, honoring the placement mode.
     *
     * `destroy` breaks what is there first, so the block yields its drops and
     * the client gets the break particles, and only then writes.
     */
    const writeBlock = (
        world: World,
        at: Vector3,
        block: BlockRef,
        mode: BlockPlacementMode,
        blockEntity?: NBTTagCompound
    ): boolean => {
        const [x, y, z] = [at.getX(), at.getY(), at.getZ()];
        const existing = readBlock(world, x, y, z);
        if (existing === undefined) return false;
        if (mode === 'keep' && existing.identifier !== 'minecraft:air') return false;

        let written: boolean;
        if (mode === 'destroy') {
            world.breakBlock(new Vector3(x, y, z));
            world.setLoadedBlockState(x, y, z, { name: block.identifier, states: block.states }, true);
            written = existing.identifier !== 'minecraft:air' || !sameBlock(existing, block);
        } else {
            written = world.setLoadedBlockState(x, y, z, { name: block.identifier, states: block.states }, true);
        }
        // A copied block entity lands even when the block was already there: `/clone` of a chest
        // onto a chest facing the same way changes no block, but the copy still brings its items.
        const landed = written || (blockEntity !== undefined && sameBlock(readBlock(world, x, y, z), block));
        if (landed) placeBlockEntity(world, x, y, z, block.identifier, blockEntity);
        return written;
    };

    /**
     * Gives a block the command just wrote the block entity it carries, as Java asks every block
     * whose class implements `EntityBlock` for a new one when it is placed.
     *
     * The write cleared whatever block entity stood there before. Without a new one an empty chest
     * is not a block entity to `/data`, and a spawner, a beacon or a command block has nothing to
     * tick or read. A behavior the write woke may already have filed one, such as a chest pairing
     * with its neighbor, and that one stays.
     *
     * @param copied - The block entity `/clone` read at the source, already moved to this
     *   position; absent, the block's empty one is made.
     * @javaSee EntityBlock.newBlockEntity
     */
    const placeBlockEntity = (
        world: World,
        x: number,
        y: number,
        z: number,
        identifier: string,
        copied: NBTTagCompound | undefined
    ): void => {
        if (bedrockBlockEntityIdOf(identifier) === undefined) return;
        const chunk = world.getLoadedChunk(x >> 4, z >> 4);
        if (chunk === null || chunk === undefined) return;
        const standing = chunk.getBlockEntity(x, y, z);
        if (standing !== null && copied === undefined) return;
        writeBlockEntity(world, copied ?? blockEntityCompound(null, { x, y, z }, identifier));
    };

    /**
     * The block entity at a position as `/clone` carries it to another, or undefined when none
     * stands there.
     *
     * Its own `x`, `y` and `z` move with it. A double chest's `pairx` and `pairz` name the other
     * half by position. When the clone copies that half too, both move by the same offset, so the
     * copies pair with each other rather than with the originals. When it does not, the pair is
     * dropped: the client draws a double chest from those tags, and the copy would show a second
     * half where no chest stands.
     *
     * @param copies - Whether the clone copies the block at a source position.
     */
    const movedBlockEntity = (
        world: World,
        from: { readonly x: number; readonly y: number; readonly z: number },
        by: { readonly x: number; readonly y: number; readonly z: number },
        copies: (x: number, y: number, z: number) => boolean
    ): NBTTagCompound | undefined => {
        const nbt = world
            .getLoadedChunk(from.x >> 4, from.z >> 4)
            ?.getBlockEntity(from.x, from.y, from.z)
            ?.toNBT();
        if (nbt === undefined) return undefined;
        nbt.addValue('x', new Types.NumberVal(from.x + by.x));
        nbt.addValue('y', new Types.NumberVal(from.y + by.y));
        nbt.addValue('z', new Types.NumberVal(from.z + by.z));
        if (nbt.has('pairx') && nbt.has('pairz')) {
            const pairX = nbt.getNumber('pairx', 0);
            const pairZ = nbt.getNumber('pairz', 0);
            if (copies(pairX, from.y, pairZ)) {
                nbt.addValue('pairx', new Types.NumberVal(pairX + by.x));
                nbt.addValue('pairz', new Types.NumberVal(pairZ + by.z));
            } else {
                for (const tag of ['pairx', 'pairz', 'pairlead']) nbt.remove(tag);
            }
        }
        return nbt;
    };

    const soundTo = (listeners: readonly EntityRef[], build: () => PlaySoundPacket | StopSoundPacket): number => {
        const sessions = sessionsOf(server, listeners);
        for (const session of sessions) carryOut(session.send(build()), 0);
        return sessions.length;
    };

    return {
        getBlock: (dimension, position) => {
            const at = blockPositionOf(position);
            return readBlock(worldIn(dimension), at.getX(), at.getY(), at.getZ());
        },

        setBlock: (dimension, position, block, mode) =>
            writeBlock(worldIn(dimension), blockPositionOf(position), block, mode),

        fill: (dimension, from, to, block, mode, filter) => {
            const world = worldIn(dimension);
            const region = regionOf(from, to);
            if (regionSize(region) > MAX_BLOCK_MODIFICATIONS) {
                unsupported(`a region bigger than ${MAX_BLOCK_MODIFICATIONS} blocks, which this`);
            }

            let changed = 0;
            for (let x = region.minX; x <= region.maxX; x += 1) {
                for (let y = region.minY; y <= region.maxY; y += 1) {
                    for (let z = region.minZ; z <= region.maxZ; z += 1) {
                        const shell = onShell(region, x, y, z);
                        // `outline` leaves the inside as it found it; `hollow`
                        // empties it. Both write the same shell.
                        if (mode === 'outline' && !shell) continue;

                        const wanted =
                            mode === 'hollow' && !shell ? { identifier: 'minecraft:air', states: {} } : block;
                        if (filter !== undefined && !matchesFilter(readBlock(world, x, y, z), filter)) continue;

                        const placement: BlockPlacementMode =
                            mode === 'keep' ? 'keep' : mode === 'destroy' ? 'destroy' : 'replace';
                        if (writeBlock(world, new Vector3(x, y, z), wanted, placement)) changed += 1;
                    }
                }
            }
            return changed;
        },

        clone: (dimension, begin, end, destination, maskMode, mode, filter) => {
            const world = worldIn(dimension);
            const region = regionOf(begin, end);
            if (regionSize(region) > MAX_BLOCK_MODIFICATIONS) {
                unsupported(`a region bigger than ${MAX_BLOCK_MODIFICATIONS} blocks, which this`);
            }

            const offset = blockPositionOf(destination);
            const shift = {
                x: offset.getX() - region.minX,
                y: offset.getY() - region.minY,
                z: offset.getZ() - region.minZ
            };

            // Read the whole source before writing any of it: an overlapping
            // destination would otherwise copy blocks this same call had
            // already written, which is the bug `force` exists to permit and
            // `normal` exists to refuse.
            const sources: { x: number; y: number; z: number; block: BlockRef }[] = [];
            for (let x = region.minX; x <= region.maxX; x += 1) {
                for (let y = region.minY; y <= region.maxY; y += 1) {
                    for (let z = region.minZ; z <= region.maxZ; z += 1) {
                        const block = readBlock(world, x, y, z);
                        if (block === undefined) continue;
                        if (maskMode === 'masked' && block.identifier === 'minecraft:air') continue;
                        if (maskMode === 'filtered' && !matchesFilter(block, filter)) continue;
                        sources.push({ x, y, z, block });
                    }
                }
            }
            const copiedPositions = new Set(sources.map(({ x, y, z }) => `${x},${y},${z}`));
            const copies = (x: number, y: number, z: number) => copiedPositions.has(`${x},${y},${z}`);
            const copied = sources.map(({ x, y, z, block }) => ({
                at: new Vector3(x + shift.x, y + shift.y, z + shift.z),
                block,
                blockEntity: movedBlockEntity(world, { x, y, z }, shift, copies)
            }));

            let changed = 0;
            for (const { at, block, blockEntity } of copied) {
                if (writeBlock(world, at, block, 'replace', blockEntity)) changed += 1;
            }

            // `move` empties the source once the copy has landed.
            if (mode === 'move') {
                for (let x = region.minX; x <= region.maxX; x += 1) {
                    for (let y = region.minY; y <= region.maxY; y += 1) {
                        for (let z = region.minZ; z <= region.maxZ; z += 1) {
                            world.setLoadedBlockState(x, y, z, { name: 'minecraft:air', states: {} }, true);
                        }
                    }
                }
            }

            return changed;
        },

        compareRegions: (dimension, begin, end, destination, masked) => {
            const world = worldIn(dimension);
            const region = regionOf(begin, end);
            const offset = blockPositionOf(destination);
            let matching = 0;

            for (let x = region.minX; x <= region.maxX; x += 1) {
                for (let y = region.minY; y <= region.maxY; y += 1) {
                    for (let z = region.minZ; z <= region.maxZ; z += 1) {
                        const source = readBlock(world, x, y, z);
                        if (masked && source?.identifier === 'minecraft:air') continue;
                        const target = readBlock(
                            world,
                            offset.getX() + (x - region.minX),
                            offset.getY() + (y - region.minY),
                            offset.getZ() + (z - region.minZ)
                        );
                        if (sameBlock(source, target)) matching += 1;
                    }
                }
            }
            return matching;
        },

        getTime: () => levelWorld().getDayTime(),
        getGameTime: () => levelWorld().getTicks(),
        setTime: (ticks) => {
            const world = levelWorld();
            world.setDayTime(ticks);
            world.syncTime();
        },
        addTime: (ticks) => {
            const world = levelWorld();
            const next = world.getDayTime() + ticks;
            world.setDayTime(next);
            world.syncTime();
            return next;
        },

        getWeather: () => levelWorld().getWeather(),
        setWeather: (kind, durationTicks) => levelWorld().setWeather(kind, durationTicks),

        getGameRule: (name) => {
            const stored = levelWorld().getGameRuleManager()?.getGameRule(serverGameRuleName(name));
            return !stored ? undefined : stored[0];
        },
        setGameRule: (name, value) => {
            if (typeof value === 'string') return false;

            const gameRules = levelWorld().getGameRuleManager();
            assert(gameRules);

            const spelling = serverGameRuleName(name);
            // Only a rule the world already holds, which are the ones BDS
            // registers; inventing another would store a value nothing ever
            // looks at.
            if (gameRules.getGameRule(spelling) === null) return false;

            gameRules.setGameRule(spelling, value, true);
            return true;
        },

        getDifficulty: () => difficultyName(server.getConfig().getDifficulty()),
        setDifficulty: (difficulty) => {
            const wanted = DIFFICULTIES[difficulty.toLowerCase()];
            if (wanted === undefined) return false;

            server.getConfig().setDifficulty(wanted);
            const packet = new SetDifficultyPacket({ difficulty: wanted });
            return carryOut(server.broadcastPacket(packet), true);
        },

        setWorldSpawn: (dimension, position, _angle) => {
            const world = worldIn(dimension);
            const at = blockPositionOf(position);
            world.setSpawnPosition(at);

            const blockPosition = { x: at.getX(), y: at.getY(), z: at.getZ() };
            const packet = new SetSpawnPositionPacket({
                type: SpawnPositionType.WorldSpawn,
                position: blockPosition,
                dimension: world.getDimension().bedrockId,
                blockPosition
            });

            return carryOut(
                world.saveLevelData().then(async () => server.broadcastPacket(packet)),
                true
            );
        },

        setSpawnPoint: (target, dimension, position, _angle) => {
            const resolved = resolveTarget(server, target);
            if (resolved === undefined) return false;
            const { player, session } = resolved;

            const at = blockPositionOf(position);
            // Forced, which is what Java's `/spawnpoint` sets: the point is used whatever is
            // standing there, where a bed only holds a spawn while the bed is there.
            player.setSpawnPoint({
                x: at.getX(),
                y: at.getY(),
                z: at.getZ(),
                dimension: worldIn(dimension).getDimension().name,
                forced: true
            });

            const blockPosition = { x: at.getX(), y: at.getY(), z: at.getZ() };
            const packet = new SetSpawnPositionPacket({
                type: SpawnPositionType.PlayerRespawn,
                position: blockPosition,
                dimension: worldIn(dimension).getDimension().bedrockId,
                blockPosition
            });

            return carryOut(session.send(packet), true);
        },
        // Structures and biomes come from the generator's own search, which lays placements
        // and the climate sampler out against the bare noise without building a chunk. A point
        // of interest is a thing this server does not keep: Java answers from its `PoiManager`,
        // an index of bed, job site and portal blocks in loaded chunks, and nothing here
        // maintains one. Refused rather than answered with a position that is not one.
        locate: (kind, name, origin, dimension) => {
            const world = worldIn(dimension);
            switch (kind) {
                case 'structure':
                    return world.locateStructure(name, origin);
                case 'biome':
                    return world.locateBiome(name, origin);
                case 'poi':
                    return unsupported('point of interest index');
            }
        },
        locateNames: (kind, dimension) =>
            kind === 'poi' ? [] : (worldIn(dimension).getGenerator().locatableNames?.(kind) ?? []),
        place: () => unsupported('runtime feature and structure placement'),

        particle: (name, position, dimension, parameters) => {
            const world = worldIn(dimension);
            const packet = new SpawnParticleEffectPacket();
            packet.dimensionId = world.getDimension().bedrockId;
            packet.effectName = name;
            packet.position = new Vector3(position.x, position.y, position.z);
            if (parameters !== undefined) packet.molangVariables = parameters;

            server.getWorldReplicators().for(world).sendAround(packet.position, packet);
            return true;
        },

        playSound: (sound, listeners, position, volume, pitch) =>
            soundTo(listeners, () => {
                const packet = new PlaySoundPacket();
                packet.name = sound;
                packet.position = new Vector3(position.x, position.y, position.z);
                packet.volume = volume;
                packet.pitch = pitch;
                return packet;
            }),

        stopSound: (listeners, sound) =>
            soundTo(listeners, () => {
                const packet = new StopSoundPacket();
                packet.soundName = sound ?? '';
                packet.stopAllSounds = sound === undefined;
                return packet;
            }),

        spreadPlayers: (dimension, center, spreadDistance, maxRange, _respectTeams, targets) => {
            // No teams exist on this server, so every player is their own
            // team and `respectTeams` is satisfied whichever way it was asked.
            const world = worldIn(dimension);
            const players = playersOf(server, targets);
            const placed: { x: number; z: number }[] = [];
            const random = server.getRandom();
            let moved = 0;

            for (const player of players) {
                let spot: { x: number; z: number } | undefined;
                for (let attempt = 0; attempt < SPREAD_ATTEMPTS && spot === undefined; attempt += 1) {
                    const candidate = {
                        x: center.x + (random() * 2 - 1) * maxRange,
                        z: center.z + (random() * 2 - 1) * maxRange
                    };
                    const clear = placed.every(
                        (other) => Math.hypot(candidate.x - other.x, candidate.z - other.z) >= spreadDistance
                    );
                    if (clear) spot = candidate;
                }
                if (spot === undefined) continue;

                placed.push(spot);
                const chunk = world.getLoadedChunk(Math.floor(spot.x) >> 4, Math.floor(spot.z) >> 4);
                const surface = chunk?.getHighestBlockAt(Math.floor(spot.x), Math.floor(spot.z));
                const y = (surface ?? world.getDimension().minY) + 1;
                carryOut(
                    player.setPlayerPosition({ position: new Vector3(spot.x, y, spot.z), type: 'teleport' }),
                    undefined
                );
                moved += 1;
            }

            return moved;
        },

        heightmap: (dimension, position, _kind) => {
            // This server keeps one heightmap, the topmost non-air block, so
            // every Java heightmap kind reads the same number.
            const world = worldIn(dimension);
            const at = blockPositionOf(position);
            const chunk = world.getLoadedChunk(at.getX() >> 4, at.getZ() >> 4);
            const highest = chunk?.getHighestBlockAt(at.getX(), at.getZ());
            return highest === null || highest === undefined ? world.getDimension().minY : highest + 1;
        },

        getBiome: (dimension, position) => {
            const world = worldIn(dimension);
            const at = blockPositionOf(position);
            const chunk = world.getLoadedChunk(at.getX() >> 4, at.getZ() >> 4);
            if (!chunk) return undefined;
            return biomeNames.get(chunk.getBiome(at.getX(), at.getY(), at.getZ()));
        },

        isLoaded: (dimension, position) => {
            const at = blockPositionOf(position);
            return worldIn(dimension).getLoadedChunk(at.getX() >> 4, at.getZ() >> 4) !== null;
        },

        dimensions: () => loadedDimensions(level()),
        dimensionIn: dimensionInLevelOf,

        tickingAreas: tickingAreaCommandHost(server, level)
    };
};
