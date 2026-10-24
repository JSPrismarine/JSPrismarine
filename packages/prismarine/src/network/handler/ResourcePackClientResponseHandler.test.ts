import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import { InetAddress } from '@jsprismarine/raknet';
import { describe, expect, it, vi } from 'vitest';

import type Console from '../../Console';
import type Player from '../../Player';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import type { Event } from '../../events/Event';
import { stub } from '../../testing/stub.test.helper';
import UUID from '../../utils/UUID';
import type GameRuleManager from '../../world/GameRuleManager';
import type { PlayerSpawn } from '../../world/SpawnPlacement';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { Dimensions } from '../../world/Dimension';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import type DataPacket from '../packet/DataPacket';
import RespawnPacket, { RespawnState } from '../packet/RespawnPacket';
import ResourcePackClientResponsePacket from '../packet/ResourcePackClientResponsePacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import StartGamePacket from '../packet/StartGamePacket';
import ResourcePackClientResponseHandler from './ResourcePackClientResponseHandler';

/**
 * Records everything the join sends, in order, under one name per packet.
 *
 * Packets written straight to the connection are named by their class. Packets the session
 * builds itself are named by the session method, since the double stands in for the method
 * and never builds the packet.
 */
const harness = ({
    cancelSpawn = false,
    joinSpawn = null
}: {
    cancelSpawn?: boolean;
    /** Where the player was placed on joining; null, the default, is a returning player. */
    joinSpawn?: PlayerSpawn | null;
} = {}) => {
    const sent: string[] = [];
    const packets: DataPacket[] = [];
    const record = (name: string) => async () => void sent.push(name);

    const world = stub<World>({
        getTicks: () => 6000,
        getDimension: () => Dimensions.Overworld,
        getSpawnPosition: async () => new Vector3(0, 64, 0),
        getName: () => 'test-world',
        getUUID: () => 'level-uuid',
        getSeed: () => 42,
        getGameRuleManager: () => stub<GameRuleManager>()
    });

    const player = stub<Player>({
        getName: () => 'runner',
        getUUID: () => UUID.fromRandom(),
        getRuntimeId: () => 1n,
        getAddress: () => new InetAddress('127.0.0.1', 19132),
        getWorld: () => world,
        getPosition: () => new Position(0, 64, 0, world),
        gamemode: Gametype.SURVIVAL,
        pitch: 0,
        yaw: 0,
        sendSettings: record('Settings'),
        getJoinSpawn: () => joinSpawn
    });

    const connection = stub<ClientConnection>({
        sendDataPacket: async (packet: DataPacket) => {
            sent.push(packet.constructor.name);
            packets.push(packet);
        }
    });

    const session = stub<PlayerSession>({
        getPlayer: () => player,
        getConnection: () => connection,
        sendCreativeContents: record('CreativeContent'),
        sendCraftingData: record('CraftingData'),
        sendAvailableCommands: record('AvailableCommands'),
        addToPlayerList: record('PlayerList(broadcast add)'),
        sendPlayerList: record('PlayerList'),
        sendTime: record('SetTime'),
        sendAttributes: record('UpdateAttributes'),
        sendMetadata: record('SetActorData'),
        sendInventory: record('InventoryContent')
    });

    const emit = vi.fn(async (_name: string, _event: unknown) => {});
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ info: () => {} }),
        getConfig: () => stub<Config>({ getGamemode: () => 'survival', getDifficulty: () => 1 }),
        getTick: () => 100,
        getConsole: () => stub<Console>({ getFormattedUsername: () => 'Console' }),
        post: ([, event]: [string, Event]) => {
            if (cancelSpawn) event.preventDefault();
            return 0;
        },
        emit
    });

    return { sent, packets, emit, server, session };
};

const response = (status: ResourcePackStatusType) => Object.assign(new ResourcePackClientResponsePacket(), { status });

describe('ResourcePackClientResponseHandler', () => {
    it('answers "have all packs" with the pack stack and nothing else', async () => {
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.HaveAllPacks),
            server,
            session
        );

        expect(sent).toEqual(['ResourcePackStackPacket']);
    });

    it('sends the join in the order a dedicated server does', async () => {
        // Pinned as a whole rather than as pairwise "before" checks: the point is the order a
        // 1.26.51 client accepts, and a reordering anywhere in it is worth a failing test.
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        expect(sent).toEqual([
            // Before StartGame: a client that reaches StartGame without it disconnects with
            // `MissingStructureData`.
            'JigsawStructureDataPacket',
            'StartGamePacket',
            // The registries.
            'ItemRegistryPacket',
            'AvailableActorIdentifiersPacket',
            'BiomeDefinitionListPacket',
            'CreativeContent',
            'CraftingData',
            'AvailableCommands',
            // World state, after the world exists on the client.
            'PlayerList(broadcast add)',
            'PlayerList',
            'SetTime',
            'SetSpawnPositionPacket',
            // The local player.
            'Settings',
            'UpdateAttributes',
            'SetActorData',
            'InventoryContent'
        ]);
    });

    it('sends no Respawn when the player returns to a saved position', async () => {
        // What BDS sends then has not been measured, so nothing is invented for it.
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        expect(sent).not.toContain('RespawnPacket');
    });

    it('sends a placed player the three Respawns BDS sends, after the inventory', async () => {
        // Measured on BDS 1.26.52: searching at the requested spot's eyes, searching at its
        // feet, then ready at the final spot's eyes, all with runtime id 0. It used to send one
        // packet object three times, which encodes once, so all three said "searching".
        const joinSpawn = {
            requested: new Vector3(4.5, 69, -6.5),
            position: new Vector3(7.5, 70, -8.5),
            relocated: true
        };
        const { sent, packets, server, session } = harness({ joinSpawn });

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        expect(sent.slice(sent.indexOf('InventoryContent') + 1)).toEqual([
            'RespawnPacket',
            'RespawnPacket',
            'RespawnPacket'
        ]);

        const respawns = packets.filter((packet) => packet instanceof RespawnPacket);
        expect(respawns.map(({ state }) => state)).toEqual([
            RespawnState.SERVER_SEARCHING_FOR_SPAWN,
            RespawnState.SERVER_SEARCHING_FOR_SPAWN,
            RespawnState.SERVER_READY_TO_SPAWN
        ]);
        expect(respawns.map(({ runtimeEntityId }) => runtimeEntityId)).toEqual([0n, 0n, 0n]);
        expect(respawns.map(({ position }) => position?.getY())).toEqual([69 + 1.62, 69, 70 + 1.62]);
        expect(respawns[2]?.position?.getX()).toBe(7.5);

        // StartGame reports the requested spot, not the final one.
        const startGame = packets.find((packet) => packet instanceof StartGamePacket);
        expect(startGame?.playerPos).toEqual(new Vector3(4.5, 69 + 1.62, -6.5));
    });

    it('sends nothing game-related before StartGame', async () => {
        // The player list and the time used to go out first. A client that has not had
        // StartGame has no world to apply them to.
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        expect(sent.slice(0, sent.indexOf('StartGamePacket'))).toEqual(['JigsawStructureDataPacket']);
    });

    it('announces the join once, after everything else', async () => {
        const { sent, emit, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        expect(emit).toHaveBeenCalledOnce();
        expect(emit.mock.calls[0]?.[0]).toBe('chat');
        expect(sent.at(-1)).toBe('InventoryContent');
    });

    it('sends nothing when a subscriber cancels the spawn', async () => {
        const { sent, emit, server, session } = harness({ cancelSpawn: true });

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        expect(sent).toEqual([]);
        expect(emit).not.toHaveBeenCalled();
    });
});
