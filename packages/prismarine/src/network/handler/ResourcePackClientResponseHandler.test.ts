import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { DisconnectReason, Gametype } from '@jsprismarine/minecraft';
import { InetAddress } from '@jsprismarine/raknet';
import { describe, expect, it, vi } from 'vitest';

import type { ConsoleSender } from '../../command/ConsoleSender';
import type Player from '../../Player';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import type { ServerContent } from '../../content/ServerContent';
import { buildServerContent } from '../../content/ServerContent';
import { fixtureBlockPalette, fixtureContentOptions } from '../../content/testing';
import type { Event } from '../../events/Event';
import { stub } from '../../testing/stub.test.helper';
import UUID from '../../utils/UUID';
import type GameRuleManager from '../../world/GameRuleManager';
import type { Generator } from '../../world/Generator';
import type { PlayerSpawn } from '../../world/SpawnPlacement';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { Dimensions } from '../../world/Dimension';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import { joinContentPayloads } from '../contentPayloads';
import type DataPacket from '../packet/DataPacket';
import RespawnPacket, { PlayerRespawnState } from '../packet/RespawnPacket';
import ResourcePackClientResponsePacket from '../packet/ResourcePackClientResponsePacket';
import SetSpawnPositionPacket from '../packet/SetSpawnPositionPacket';
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
    content = undefined,
    joinSpawn = null,
    spawn = new Vector3(0, 64, 0)
}: {
    cancelSpawn?: boolean;
    /** The content build, or undefined for a server with `content-packs` off. */
    content?: ServerContent | undefined;
    /** Where the player was placed on joining; null, the default, is a returning player. */
    joinSpawn?: PlayerSpawn | null;
    /** The world spawn `getSpawnPosition` answers with. */
    spawn?: Vector3;
} = {}) => {
    const sent: string[] = [];
    /** The packets written straight to the connection, for the tests that read their fields. */
    const packets: DataPacket[] = [];
    const record = (name: string) => async () => void sent.push(name);
    const kick = vi.fn(async (_reason: string, _code?: DisconnectReason) => {});
    const debug = vi.fn((_message: string, _context?: string) => {});

    const world = stub<World>({
        getTicks: () => 6000,
        getDimension: () => Dimensions.Overworld,
        getGenerator: () => stub<Generator>(),
        getSpawnPosition: async () => spawn,
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
        getJoinSpawn: () => joinSpawn,
        kick
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
        getLogger: () => stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug }),
        getContent: () => content,
        getConfig: () => stub<Config>({ getGamemode: () => 'survival', getDifficulty: () => 1 }),
        getTick: () => 100,
        getConsoleSender: () => stub<ConsoleSender>({ getFormattedUsername: () => 'Console' }),
        post: ([, event]: [string, Event]) => {
            if (cancelSpawn) event.preventDefault();
            return 0;
        },
        emit
    });

    return { sent, packets, emit, kick, debug, server, session };
};

const response = (status: ResourcePackStatusType, packIds: string[] = []) =>
    Object.assign(new ResourcePackClientResponsePacket(), { status, packIds });

/**
 * The fixture content with its join payloads already built and cached.
 *
 * The handler builds against the palette a real client has, and the fixture's
 * is two blocks, so the payloads are built here against the fixture palette
 * and the handler's own call then answers from the cache.
 */
const fixtureJoinPayloads = () => {
    const content = buildServerContent(fixtureContentOptions());
    const payloads = joinContentPayloads(content, stub<Logger>({ info: () => {}, warn: () => {}, error: () => {} }), {
        clientPalette: fixtureBlockPalette()
    });

    if (payloads === undefined) throw new Error('the fixture content produced no payloads');

    return { content, payloads };
};

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
            'FeatureRegistryPacket',
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

    it('floors a fractional world spawn into the block positions of SetSpawnPosition', async () => {
        // Both positions are `BlockPos`, and a ZigZag varint write truncates toward zero, so
        // the spawn at -0.5 would have gone out as block 0.
        const { packets, server, session } = harness({ spawn: new Vector3(0.5, 64.9, -0.5) });

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        const packet = packets.find((sent) => sent instanceof SetSpawnPositionPacket);
        expect(packet).toBeInstanceOf(SetSpawnPositionPacket);
        if (!(packet instanceof SetSpawnPositionPacket)) return;

        const components = (position: Vector3) => [position.getX(), position.getY(), position.getZ()];
        expect(components(packet.position)).toEqual([0, 64, -1]);
        expect(components(packet.blockPosition)).toEqual([0, 64, -1]);
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
            PlayerRespawnState.SearchingForSpawn,
            PlayerRespawnState.SearchingForSpawn,
            PlayerRespawnState.ReadyToSpawn
        ]);
        expect(respawns.map(({ runtimeEntityId }) => runtimeEntityId)).toEqual([0n, 0n, 0n]);
        expect(respawns.map(({ position }) => position?.getY())).toEqual([69 + 1.62, 69, 70 + 1.62]);
        expect(respawns[2]?.position?.getX()).toBe(7.5);

        // StartGame reports the requested spot, not the final one.
        const startGame = packets.find((packet) => packet instanceof StartGamePacket);
        expect(startGame?.playerPos).toEqual(new Vector3(4.5, 69 + 1.62, -6.5));
    });

    it('leaves StartGame on the captured definitions when no content was built', async () => {
        const { packets, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        const startGame = packets.find((packet) => packet instanceof StartGamePacket);
        expect(startGame?.blockProperties).toBeNull();
    });

    it('declares what the content build holds in StartGame', async () => {
        const { content } = fixtureJoinPayloads();
        const { packets, server, session } = harness({ content });

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.Completed),
            server,
            session
        );

        // The fixture's two blocks are both in the client's palette and
        // neither is one Mojang defines in data, so the registries declare an
        // empty list where the captured path would have sent all 98.
        const startGame = packets.find((packet) => packet instanceof StartGamePacket);
        expect(startGame?.blockProperties).toEqual([]);
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

    it('kicks a player that refuses the packs, with the resource pack reason', async () => {
        const { sent, kick, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatusType.Refused), server, session);

        expect(kick).toHaveBeenCalledOnce();
        expect(kick.mock.calls[0]?.[1]).toBe(DisconnectReason.RESOURCE_PACK_PROBLEM);
        expect(sent).toEqual([]);
    });

    it('kicks a player that asks for packs, since the server offers none', async () => {
        // A `ResourcePackDataInfo` per pack is the answer once the server serves packs. Until
        // then a client waiting for one would sit on the loading screen until RakNet times out.
        const { sent, kick, debug, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatusType.SendPacks, ['a_1.0.0', 'b_2.0.0']),
            server,
            session
        );

        expect(kick).toHaveBeenCalledOnce();
        expect(kick.mock.calls[0]?.[1]).toBe(DisconnectReason.RESOURCE_PACK_PROBLEM);
        expect(debug.mock.calls[0]?.[0]).toContain('2 resource pack(s)');
        expect(sent).toEqual([]);
    });

    it('drops a status outside the four without sending or kicking', async () => {
        // `decodePayload` rejects a fifth alternative, so this only reaches the handler from a
        // caller setting the field. Numeric enums accept any number.
        const unknown: number = 9;
        const { sent, kick, emit, debug, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(response(unknown), server, session);

        expect(sent).toEqual([]);
        expect(kick).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledOnce();
    });

    it('starts the join once, however many times the client says it completed', async () => {
        const { sent, emit, server, session } = harness();
        const handler = new ResourcePackClientResponseHandler();

        await handler.handle(response(ResourcePackStatusType.Completed), server, session);
        const afterFirst = [...sent];
        await handler.handle(response(ResourcePackStatusType.Completed), server, session);

        expect(sent).toEqual(afterFirst);
        expect(emit).toHaveBeenCalledOnce();
    });

    it('sends no second pack stack once the join has started', async () => {
        const { sent, server, session } = harness();
        const handler = new ResourcePackClientResponseHandler();

        await handler.handle(response(ResourcePackStatusType.Completed), server, session);
        const afterJoin = [...sent];
        await handler.handle(response(ResourcePackStatusType.HaveAllPacks), server, session);

        expect(sent).toEqual(afterJoin);
    });

    it('keeps the join per session', async () => {
        // The guard is keyed on the session, not on the handler: a second player joining
        // through the same handler instance still gets its burst.
        const first = harness();
        const second = harness();
        const handler = new ResourcePackClientResponseHandler();

        await handler.handle(response(ResourcePackStatusType.Completed), first.server, first.session);
        await handler.handle(response(ResourcePackStatusType.Completed), second.server, second.session);

        expect(second.sent).toEqual(first.sent);
        expect(second.sent).toContain('StartGamePacket');
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
