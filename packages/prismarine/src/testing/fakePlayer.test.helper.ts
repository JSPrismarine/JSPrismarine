import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { InetAddress } from '@jsprismarine/raknet';
import type { RakNetSession } from '@jsprismarine/raknet';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { vi } from 'vitest';

import Player from '../Player';
import type Server from '../Server';
import type SessionManager from '../SessionManager';
import type { Block } from '../block/Block';
import type { ConsoleSender } from '../command/ConsoleSender';
import type { Config } from '../config/Config';
import type ClientConnection from '../network/ClientConnection';
import Codec2193 from '../network/codec/Codec2193';
import { createConnectedPlayer } from '../network/createConnectedPlayer';
import type { PermissionManager } from '../permission/PermissionManager';
import type { BlockMining } from '../world/BlockMining';
import type { ChunkScheduler } from '../world/ChunkScheduler';
import type GameRuleManager from '../world/GameRuleManager';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import Chunk from '../world/chunk/Chunk';
import { Dimensions } from '../world/DimensionType';
import { testContent } from './entityServer';
import { stub } from './stub.test.helper';

/**
 * A player with just enough of a server, world and connection around it to move, tick and
 * change world.
 *
 * The world is either dry or entirely water, which is all the block detail breath needs. Its
 * chunks are empty Overworld chunks, enough for the session's chunk batching to run.
 */
export const fakePlayer = ({ underwater = false }: { underwater?: boolean } = {}) => {
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
    /** Every debug line the server logged. */
    const logged: string[] = [];
    /** What the world was asked to do with the player, in order: `save`, `remove`, `add`. */
    const roster: string[] = [];
    const disconnects: Parameters<ClientConnection['disconnect']>[] = [];
    const isOp = vi.fn(() => false);

    const server: Server = stub<Server>({
        on: () => server,
        post: () => 0,
        emit: async (name: string, event: unknown) => void events.push([name, event]),
        getTick: () => 0,
        getConsoleSender: () => stub<ConsoleSender>({ getFormattedUsername: () => 'Console' }),
        getLogger: () =>
            stub<Logger>({ debug: (...message) => void logged.push(String(message[0] ?? '')), verbose: () => {} }),
        // What leaving and a change of game mode tell everyone else.
        getSessionManager: () => stub<SessionManager>({ getPlayerList: () => new Map(), getAllPlayers: () => [] }),
        broadcastPacket: async () => {},
        removeListener: () => server,
        getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
        getPermissionManager: () => stub<PermissionManager>({ getPermissions: async () => [], isOp }),
        // A login looks for the player's record in every loaded world, each world keeping its
        // own: see `lastPlayerRecord`.
        getWorldManager: () => stub<WorldManager>({ getWorlds: () => [world] }),
        // No pack stack, so there are no advancements to raise and no
        // enchantment definitions to run.
        getContent: () => testContent(),
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getProximityBroadcast: () => true,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4,
                getPacketCompressionLevel: () => 0
            })
    });

    const world = stub<World>({
        getName: () => 'test',
        getServer: () => server,
        getPlayerData: async () => ({}),
        getDimension: () => Dimensions.Overworld,
        broadcastMove: async () => {},
        removeEntity: async () => void roster.push('remove'),
        addEntity: async () => void roster.push('add'),
        getPlayers: () => [],
        getSpawnPosition: async () => new Vector3(0, 64, 0),
        // Feet one block above the stored spawn, centered, as a Bedrock server places them.
        placePlayerSpawn: async () => ({
            requested: new Vector3(0.5, 65, 0.5),
            position: new Vector3(0.5, 65, 0.5),
            relocated: false
        }),
        getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] }),
        getBlock: async () => stub<Block>({ getName: () => (underwater ? 'minecraft:water' : 'minecraft:air') }),
        getChunk: async (x, z) => new Chunk(x, z),
        sendActorEvent: async (_entity, event) => void actorEvents.push(event),
        sendActorSound: async (_entity, sound) => void actorSounds.push(sound),
        savePlayerData: async () => void roster.push('save'),
        updateBlockCracking: async (mining) => {
            cracked.push(mining);
            return mined.stays;
        },
        stopBlockCracking: async (position) => void stopped.push(position)
    });

    const connection = stub<ClientConnection>({
        codec: Codec2193,
        getRakNetSession: () => stub<RakNetSession>({ getAddress: () => new InetAddress('127.0.0.1', 19132) }),
        sendDataPacket: async (packet) => void sent.push(packet),
        sendPacketsAsync: async (packets) => void sent.push(...packets),
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async (...args) => void disconnects.push(args)
    });

    const player = new Player({
        position: new Position(0, 64, 0, world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: {
            uuid: UUID.fromRandom(),
            name: 'Tester',
            xuid: '',
            randomId: 0,
            locale: 'en_US',
            skin: null,
            device: null
        }
    });

    createConnectedPlayer({ server, connection, player });

    // `update` does nothing for a player who never finished joining.
    player['connected'] = true;

    return {
        player,
        server,
        world,
        connection,
        sent,
        events,
        actorEvents,
        actorSounds,
        logged,
        roster,
        disconnects,
        isOp,
        cracked,
        stopped,
        mined
    };
};
