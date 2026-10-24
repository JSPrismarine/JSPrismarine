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
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import type DataPacket from '../packet/DataPacket';
import ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import ResourcePackResponseHandler from './ResourcePackResponseHandler';

/**
 * Records everything the join sends, in order, under one name per packet.
 *
 * Packets written straight to the connection are named by their class. Packets the session
 * builds itself are named by the session method, since the double stands in for the method
 * and never builds the packet.
 */
const harness = ({ cancelSpawn = false }: { cancelSpawn?: boolean } = {}) => {
    const sent: string[] = [];
    const record = (name: string) => async () => void sent.push(name);

    const world = stub<World>({
        getTicks: () => 6000,
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
        sendSettings: record('Settings')
    });

    const connection = stub<ClientConnection>({
        sendDataPacket: async (packet: DataPacket) => void sent.push(packet.constructor.name)
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

    return { sent, emit, server, session };
};

const response = (status: ResourcePackStatusType) => Object.assign(new ResourcePackResponsePacket(), { status });

describe('ResourcePackResponseHandler', () => {
    it('answers "have all packs" with the pack stack and nothing else', async () => {
        const { sent, server, session } = harness();

        await new ResourcePackResponseHandler().handle(response(ResourcePackStatusType.HaveAllPacks), server, session);

        expect(sent).toEqual(['ResourcePackStackPacket']);
    });

    it('sends the join in the order a dedicated server does', async () => {
        // Pinned as a whole rather than as pairwise "before" checks: the point is the order a
        // 1.26.51 client accepts, and a reordering anywhere in it is worth a failing test.
        const { sent, server, session } = harness();

        await new ResourcePackResponseHandler().handle(response(ResourcePackStatusType.Completed), server, session);

        expect(sent).toEqual([
            // Before StartGame: a client that reaches StartGame without it disconnects with
            // `MissingStructureData`.
            'JigsawStructureDataPacket',
            'StartGamePacket',
            // The registries.
            'ItemComponentPacket',
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

    it('sends no Respawn during the join', async () => {
        // Three went out here, one of them `CLIENT_READY_TO_SPAWN` - a state only a client
        // sends. No vanilla server sends a Respawn at login.
        const { sent, server, session } = harness();

        await new ResourcePackResponseHandler().handle(response(ResourcePackStatusType.Completed), server, session);

        expect(sent).not.toContain('RespawnPacket');
    });

    it('sends nothing game-related before StartGame', async () => {
        // The player list and the time used to go out first. A client that has not had
        // StartGame has no world to apply them to.
        const { sent, server, session } = harness();

        await new ResourcePackResponseHandler().handle(response(ResourcePackStatusType.Completed), server, session);

        expect(sent.slice(0, sent.indexOf('StartGamePacket'))).toEqual(['JigsawStructureDataPacket']);
    });

    it('announces the join once, after everything else', async () => {
        const { sent, emit, server, session } = harness();

        await new ResourcePackResponseHandler().handle(response(ResourcePackStatusType.Completed), server, session);

        expect(emit).toHaveBeenCalledOnce();
        expect(emit.mock.calls[0]?.[0]).toBe('chat');
        expect(sent.at(-1)).toBe('InventoryContent');
    });

    it('sends nothing when a subscriber cancels the spawn', async () => {
        const { sent, emit, server, session } = harness({ cancelSpawn: true });

        await new ResourcePackResponseHandler().handle(response(ResourcePackStatusType.Completed), server, session);

        expect(sent).toEqual([]);
        expect(emit).not.toHaveBeenCalled();
    });
});
