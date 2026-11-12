import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { InetAddress } from '@jsprismarine/raknet';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { vi } from 'vitest';

import type Server from '../Server';
import type { Block } from '../block/Block';
import { BlockState } from '../block/state/BlockState';
import { ChatManager } from '../chat/ChatManager';
import type { ConsoleSender } from '../command/ConsoleSender';
import type { Config } from '../config/Config';
import type ClientConnection from '../network/ClientConnection';
import Codec2193 from '../network/codec/Codec2193';
import { createConnectedPlayer } from '../network/createConnectedPlayer';
import { NetworkWorldReplicator } from '../network/NetworkWorldReplicator';
import type { PermissionManager } from '../permission/PermissionManager';
import type { BlockMining } from '../world/BlockMining';
import type { ChunkScheduler } from '../world/ChunkScheduler';
import type GameRuleManager from '../world/GameRuleManager';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import Chunk from '../world/chunk/Chunk';
import { Dimensions } from '../world/DimensionType';
import { RespawnRequests } from '../world/RespawnRequests';
import { enterStore, leaveStore } from '../entity/data/storePlayers';
import { entityIds } from '../entity/entityIds';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { StorePlayer } from '../entity/storePlayer';
import type PlayerSession from '../network/PlayerSession';
import { liveTestEntities } from './entityServer';
import { fakeLevel } from './level';
import { sessionsWith } from './playerSession.test.helper';
import { stub } from './stub.test.helper';
import { replicateEntities } from './changeTicks.test.helper';

/** What a test says about the player's surroundings. */
export interface FakePlayerOptions {
    /** Whether the world is entirely water rather than air. */
    readonly underwater?: boolean;
    /**
     * Other worlds of the same level, by their own dimension type, which the level answers
     * `world(id)` with. A world the test wants the player to reach needs `getLevel` of its own.
     */
    readonly worlds?: readonly World[];
    /**
     * The player's name, `Tester` by default. Per-player services are keyed by the name of a
     * player with no XUID, so two fake players that must not share state need two names.
     */
    readonly name?: string;
}

/**
 * A player's session with just enough of a server, world and connection around it to move, tick
 * and change world, and the store player it speaks for.
 *
 * The player is a store player whose entity is in a real entity runtime of the fixture content,
 * the world's `live`, as a spawned player's is: blows, moves, its meal and its death go through
 * the store. The world is either dry or entirely water, which is what the world's own block reads
 * answer; the runtime reads the fixture's empty world. Its chunks are empty Overworld chunks,
 * enough for the session's chunk batching to run. It is the Overworld of a level that also holds
 * `worlds`, and the server's default world.
 */
export const fakePlayer = ({ underwater = false, worlds: others = [], name = 'Tester' }: FakePlayerOptions = {}) => {
    const sent: any[] = [];
    /** Every tick of crack animation the player asked the world for. */
    const cracked: BlockMining[] = [];
    /** Every block whose cracks the player asked the world to stop. */
    const stopped: Vector3[] = [];
    /** Whether the mined block is still the one being mined, as the world answers each tick. */
    const mined = { stays: true };
    const events: any[] = [];
    const actorEvents: number[] = [];
    const actorSounds: number[] = [];
    /** Every sound played by name rather than by level sound event. */
    const namedSounds: string[] = [];
    /** Every debug and warning line the server logged. */
    const logged: string[] = [];
    /** What the world was asked to do with the player, in order: `save`, `remove`, `add`. */
    const roster: string[] = [];
    const disconnects: Parameters<ClientConnection['disconnect']>[] = [];
    const isOp = vi.fn(() => false);
    // Read at call time: the content and the runtime are built around the world below.
    const entities = liveTestEntities(() => world);
    /** The world's tick, which the store's level clock reads; a test moves it. */
    const clock = { ticks: 0 };

    const server: Server = stub<Server>({
        on: () => server,
        post: () => 0,
        emit: async (name: string, event: unknown) => void events.push([name, event]),
        getTick: () => 0,
        getConsoleSender: () => stub<ConsoleSender>({ getFormattedUsername: () => 'Console' }),
        getLogger: () =>
            stub<Logger>({
                debug: (...message) => void logged.push(String(message[0] ?? '')),
                warn: (...message) => void logged.push(String(message[0] ?? '')),
                verbose: () => {}
            }),
        // What leaving and a change of game mode tell everyone else.
        getSessionManager: () => sessions,
        broadcastPacket: async () => {},
        removeListener: () => server,
        getChatManager: () => chat,
        getRespawnRequests: () => respawnRequests,
        getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
        getPermissionManager: () => stub<PermissionManager>({ permissionsOf: () => [], isOp }),
        getWorldManager: () => stub<WorldManager>({ getDefaultWorld: () => world }),
        // No pack stack, so there are no advancements to raise and no
        // enchantment definitions to run.
        getContent: () => entities.content(),
        getEntityRuntime: (dimension) => entities.entityRuntime(dimension),
        getStorePlayers: () => entities.players,
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getProximityBroadcast: () => true,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4,
                getPacketCompressionLevel: () => 0,
                getPacketCompressionThreshold: () => 256
            })
    });

    const sessions = sessionsWith({ getPlayerList: () => new Map(), getAllPlayers: () => [], getSessions: () => [] });
    const chat = new ChatManager(server);
    // The searches a death files, which a test admits as the input step would.
    const respawnRequests = new RespawnRequests((error) => void logged.push(String(error)));

    const blockName = underwater ? 'minecraft:water' : 'minecraft:air';
    const world: World = stub<World>({
        getName: () => 'test',
        getServer: () => server,
        getLevel: () => level,
        getPlayerData: async () => ({}),
        getDimension: () => Dimensions.Overworld,
        broadcastMove: async () => {},
        dataEntities: () => entities.entityRuntime(Dimensions.Overworld.name),
        getTicks: () => clock.ticks,
        // No chunk is loaded for the store, so its systems read no block.
        getLoadedChunk: () => null,
        loadedBlockRuntimeIdAt: () => undefined,
        getBlockWriteVersion: () => 0,
        getActor: (runtimeId) =>
            entities.entityRuntime(Dimensions.Overworld.name).actors.actorOf(Number(runtimeId)) ?? null,
        viewerOf: (runtimeId) => (runtimeId === player.getRuntimeId() ? session : undefined),
        getViewers: () => [session],
        storeEntityChunkChanged: () => {},
        // Out of the store, as a real world takes a leaving player's entity out of its store.
        removePlayer: async (leaving) => {
            roster.push('remove');
            leaveStore(entities.entityRuntime(Dimensions.Overworld.name).runtime, leaving.getPlayer(), 'left_world');
        },
        addPlayer: async () => void roster.push('add'),
        getSpawnPosition: async () => new Vector3(0, 64, 0),
        getKnownSpawnPosition: () => new Vector3(0, 64, 0),
        // Feet one block above the stored spawn, centered, as a Bedrock server places them.
        placePlayerSpawn: async () => ({
            requested: new Vector3(0.5, 65, 0.5),
            position: new Vector3(0.5, 65, 0.5),
            relocated: false
        }),
        getGameRuleManager: () =>
            stub<GameRuleManager>({ getGameRule: () => [true, true], findGameRule: () => [true, true] }),
        getBlock: async () => stub<Block>({ getName: () => blockName, isSolid: () => false }),
        getBlockState: async () => new BlockState(blockName),
        loadedBlockAt: () => ({ name: blockName, states: {} }),
        getChunk: async (x, z) => new Chunk(x, z),
        sendActorEvent: async (_entity, event) => void actorEvents.push(event),
        sendStatusEffect: async () => {},
        sendActorSound: async (_entity, sound) => void actorSounds.push(sound),
        playNamedSoundAt: (_position, sound) => void namedSounds.push(sound),
        savePlayerData: async () => void roster.push('save'),
        updateBlockCracking: async (mining) => {
            cracked.push(mining);
            return mined.stays;
        },
        stopBlockCracking: async (position) => void stopped.push(position)
    });

    const level = fakeLevel({
        server,
        worlds: () => [world, ...others],
        stems: new Map(
            [world, ...others].map((each) => {
                const { id } = each.getDimension();
                return [id, { type: id, generator: { type: 'jsprismarine:test', settings: undefined } }];
            })
        )
    });

    const connection = stub<ClientConnection>({
        codec: Codec2193,
        compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
        compressionThreshold: 256,
        getAddress: () => new InetAddress('127.0.0.1', 19132),
        sendDataPacket: async (packet) => void sent.push(packet),
        sendPacketsAsync: async (packets) => void sent.push(...packets),
        sendSharedBatch: async (_content, packets) => void sent.push(...packets),
        sendSharedBatchAsync: async (batch) => void sent.push(...(await batch).packets),
        sendSharedCompressedBatchAsync: async (_content, packets) => void sent.push(...packets),
        // World ticks drain queued packets after all tick-driven sends; this double has no transport queue.
        flushOutboundPackets: async () => {},
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async (...args) => void disconnects.push(args)
    });

    const player = new StorePlayer(entityIds.next(), { uuid: UUID.fromRandom(), name, xuid: '' });
    player.standAt({ x: 0, y: 64 - EYE_HEIGHT, z: 0 });

    const session: PlayerSession = createConnectedPlayer({
        server,
        connection,
        player,
        identity: { name, xuid: '', uuid: player.getUUID().toString() },
        world
    });

    // `update` does nothing for a player who never finished joining.
    session['joined'] = true;

    // Spawned, as `SetLocalPlayerAsInitialized` spawns a joined player, without the roster entry
    // `addPlayer` makes.
    const live = entities.entityRuntime(Dimensions.Overworld.name);
    enterStore(live.runtime, entities.players, player);

    // The world's replication, which reads each tick of the store's log as it seals.
    const replicator = new NetworkWorldReplicator(world, server);
    live.runtime.store.onSealed((sealed) => replicator.tickSealed(sealed));
    /**
     * One tick of the store's log around `work`, then what replication sends of it, as a world's
     * tick runs them.
     */
    const logTick = async (work: () => Promise<void>): Promise<void> => {
        live.runtime.store.beginTick();
        try {
            await work();
        } finally {
            live.runtime.store.sealTick();
        }
        await replicateEntities(replicator);
    };

    return {
        replicator,
        logTick,
        session,
        player,
        server,
        world,
        live,
        clock,
        level,
        connection,
        sent,
        events,
        actorEvents,
        actorSounds,
        namedSounds,
        logged,
        roster,
        respawnRequests,
        disconnects,
        isOp,
        cracked,
        stopped,
        mined
    };
};
