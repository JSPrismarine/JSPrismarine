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
import { fakeLevel, TEST_OVERWORLD_STEM } from '../../testing/level';
import { stub } from '../../testing/stub.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type GameRuleManager from '../../world/GameRuleManager';
import type { Generator } from '../../world/Generator';
import type { Level } from '../../world/Level';
import type { PlayerSpawn } from '../../world/SpawnPlacement';
import type { StoredSpawnPoint } from '../../world/RespawnPoint';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { Dimensions, dimensionTypeOf, FIRST_CUSTOM_DIMENSION_ID } from '../../world/Dimension';
import type ClientConnection from '../ClientConnection';
import Codec2193 from '../codec/Codec2193';
import { registeredCodecs } from '../codec/CodecRegistry';
import Codec2225 from '../codec/Codec2225';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type PlayerSession from '../PlayerSession';
import { joinContentPayloads } from '../contentPayloads';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import DimensionDataPacket from '@jsprismarine/protocol/packet/DimensionDataPacket';
import PackId from '@jsprismarine/protocol/structure/UUID';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import ResourcePackClientResponsePacket from '@jsprismarine/protocol/packet/ResourcePackClientResponsePacket';
import SetSpawnPositionPacket from '@jsprismarine/protocol/packet/SetSpawnPositionPacket';
import { ResourcePackStatus } from '@jsprismarine/protocol';
import ItemRegistryPacket from '@jsprismarine/protocol/packet/ItemRegistryPacket';
import StartGamePacket from '@jsprismarine/protocol/packet/StartGamePacket';
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
    content = fixtureJoinPayloads().content,
    joinSpawn = null,
    spawn = new Vector3(0, 64, 0),
    serverAuthoritativeBreaking = true,
    codec = Codec2193,
    level = fakeLevel(),
    spawnPoint
}: {
    cancelSpawn?: boolean;
    /** The content build whose registries the join burst writes from. */
    content?: ServerContent;
    /** Where the player was placed on joining; null, the default, is a returning player. */
    joinSpawn?: PlayerSpawn | null;
    /** The world spawn `getSpawnPosition` answers with. */
    spawn?: Vector3;
    /** The `server-authoritative-block-breaking` setting. */
    serverAuthoritativeBreaking?: boolean;
    /** The protocol codec the connection negotiated, which fixes the item numbering. */
    codec?: ProtocolCodec;
    /** The level behind the join world. Defaults to a vanilla one with nothing to announce. */
    level?: Level;
    /** The player's own spawn point; left out, the player comes back at the world spawn. */
    spawnPoint?: StoredSpawnPoint;
} = {}) => {
    const sent: string[] = [];
    /** The packets written straight to the connection, for the tests that read their fields. */
    const packets: NetworkPacket[] = [];
    const record = (name: string) => async () => void sent.push(name);
    const kick = vi.fn(async (_reason: string, _code?: DisconnectReason) => {});
    const debug = vi.fn((_message: string, _context?: string) => {});

    const world = stub<World>({
        getTicks: () => 6000,
        getLevel: () => level,
        getStem: () => TEST_OVERWORLD_STEM,
        getDimension: () => Dimensions.Overworld,
        getGenerator: () => stub<Generator>(),
        getSpawnPosition: async () => spawn,
        getName: () => 'test-world',
        getUUID: () => 'level-uuid',
        getSeed: () => 42n,
        getGameRuleManager: () =>
            stub<GameRuleManager>({ getGameRules: () => new Map<string, [boolean | number, boolean]>() })
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
        getSpawnPoint: () => spawnPoint,
        kick
    });

    const connection = stub<ClientConnection>({
        codec,
        sendDataPacket: async (packet: NetworkPacket) => {
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
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getDifficulty: () => 1,
                getServerAuthoritativeBlockBreaking: () => serverAuthoritativeBreaking
            }),
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

const response = (status: ResourcePackStatus, packIds: string[] = []) =>
    new ResourcePackClientResponsePacket({ status, packIds });

/**
 * The fixture content with its join payloads already built and cached.
 *
 * The handler builds against the palette a real client has, and the fixture's
 * is two blocks, so the payloads are built here against the fixture palette
 * and the handler's own call then answers from the cache.
 */
const payloadsFor = (content: ServerContent, codec: ProtocolCodec) => {
    const payloads = joinContentPayloads(content, stub<Logger>({ info: () => {}, warn: () => {}, error: () => {} }), {
        clientPalette: fixtureBlockPalette(),
        itemData: codec.itemData
    });

    if (payloads === undefined) throw new Error('the fixture content produced no payloads');

    return payloads;
};

const fixtureJoinPayloads = () => {
    const content = buildServerContent(fixtureContentOptions());

    // One build per registered codec, since the payloads are cached per protocol version and a
    // test may negotiate any of them.
    for (const codec of registeredCodecs) payloadsFor(content, codec);

    return { content, payloads: payloadsFor(content, Codec2193) };
};

describe('ResourcePackClientResponseHandler', () => {
    it('answers "have all packs" with the pack stack and nothing else', async () => {
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatus.HaveAllPacks),
            server,
            session
        );

        expect(sent).toEqual(['ResourcePackStackPacket']);
    });

    it('sends the join in the order a dedicated server does', async () => {
        // Pinned as a whole rather than as pairwise "before" checks: the point is the order a
        // 1.26.51 client accepts, and a reordering anywhere in it is worth a failing test.
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

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

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

        const packet = packets.find((sent) => sent instanceof SetSpawnPositionPacket);
        expect(packet).toBeInstanceOf(SetSpawnPositionPacket);
        if (!(packet instanceof SetSpawnPositionPacket)) return;

        const data = packet.getPacketData();
        expect(data?.position).toEqual({ x: 0, y: 64, z: -1 });
        expect(data?.blockPosition).toEqual({ x: 0, y: 64, z: -1 });
    });

    it('announces no dimension for a level of vanilla dimensions', async () => {
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

        expect(sent).not.toContain('DimensionDataPacket');
    });

    describe('with a custom dimension type', () => {
        /** The Overworld's type under a pack's id, with the one attribute the announcement reads. */
        const sky = dimensionTypeOf(
            { ...Dimensions.Overworld.java, attributes: new Map([['minecraft:visual/cloud_height', 192]]) },
            'mypack:sky',
            FIRST_CUSTOM_DIMENSION_ID
        );
        const level = () =>
            fakeLevel({
                dimensionTypes: new Map([
                    [Dimensions.Overworld.id, Dimensions.Overworld],
                    [sky.id, sky]
                ]),
                customDimensionDefinitions: [
                    {
                        minimumY: sky.minY,
                        heightRange: sky.height,
                        generatorType: 5,
                        dimensionType: sky.bedrockId,
                        packId: new PackId(0n, 0n),
                        defaultBiome: 'minecraft:plains',
                        cloudHeight: 192,
                        renderClouds: true
                    }
                ]
            });

        const dimensionDataSentTo = async (codec: ProtocolCodec) => {
            const { sent, packets, server, session } = harness({ codec, level: level() });
            await new ResourcePackClientResponseHandler().handle(
                response(ResourcePackStatus.Completed),
                server,
                session
            );
            const packet = packets.find((sent) => sent instanceof DimensionDataPacket);
            if (!(packet instanceof DimensionDataPacket)) throw new Error('no DimensionData was sent');
            return { sent, packet };
        };

        it('announces it once, between StartGame and the registries', async () => {
            const { sent, packet } = await dimensionDataSentTo(Codec2193);

            expect(sent.indexOf('DimensionDataPacket')).toBe(sent.indexOf('StartGamePacket') + 1);
            expect(sent.filter((name) => name === 'DimensionDataPacket')).toHaveLength(1);

            const definitions = packet.getPacketData()?.definitions ?? [];
            expect(definitions.map((entry) => entry.id)).toEqual(['mypack:sky']);
            expect(definitions[0]?.definition.dimensionType).toBe(FIRST_CUSTOM_DIMENSION_ID);
            expect(definitions[0]?.definition.minimumY).toBe(-64);
            expect(definitions[0]?.definition.heightRange).toBe(384);
        });

        it('puts the cloud fields on the wire for a 2225 session and not for a 2193 one', async () => {
            // The packet picks its layout from the context the connection encodes it with, so
            // the same handler output carries `Cloud Height` and `Render Clouds` only at 2225.
            const roundTrip = async (codec: ProtocolCodec) => {
                const { packet } = await dimensionDataSentTo(codec);
                const bytes = packet.serialize(new NetworkBinaryStream(), codec.context);
                const read = new DimensionDataPacket().deserialize(new NetworkBinaryStream(bytes), codec.context);
                return read.definitions[0]?.definition;
            };

            const at2225 = await roundTrip(Codec2225);
            expect(at2225?.cloudHeight).toBe(192);
            expect(at2225?.renderClouds).toBe(true);

            const at2193 = await roundTrip(Codec2193);
            expect(at2193?.dimensionType).toBe(FIRST_CUSTOM_DIMENSION_ID);
            expect(at2193?.cloudHeight).toBe(0);
            expect(at2193?.renderClouds).toBe(false);
        });
    });

    describe('SetSpawnPosition', () => {
        const spawnPositionSentBy = async (options: Parameters<typeof harness>[0]) => {
            const { packets, server, session } = harness(options);
            await new ResourcePackClientResponseHandler().handle(
                response(ResourcePackStatus.Completed),
                server,
                session
            );
            const packet = packets.find((sent) => sent instanceof SetSpawnPositionPacket);
            if (!(packet instanceof SetSpawnPositionPacket)) throw new Error('no SetSpawnPosition was sent');
            return packet.getPacketData();
        };

        it('carries the world spawn in the join dimension for a player with no point of their own', async () => {
            const data = await spawnPositionSentBy({ spawn: new Vector3(5, 63, -6) });

            expect(data?.position).toEqual({ x: 5, y: 63, z: -6 });
            expect(data?.dimension).toBe(Dimensions.Overworld.bedrockId);
        });

        it('carries the player spawn point in its own dimension, not the join world one', async () => {
            // A bed in the Nether: the client shows it on the compass there, and the join
            // world is the Overworld.
            const data = await spawnPositionSentBy({
                spawnPoint: { x: 10, y: 70, z: -5, dimension: Dimensions.Nether.name }
            });

            expect(data?.position).toEqual({ x: 10, y: 70, z: -5 });
            expect(data?.blockPosition).toEqual({ x: 10, y: 70, z: -5 });
            expect(data?.dimension).toBe(Dimensions.Nether.bedrockId);
        });

        it('resolves a custom dimension to the id the level chose', async () => {
            const sky = dimensionTypeOf(Dimensions.Overworld.java, 'mypack:sky', FIRST_CUSTOM_DIMENSION_ID);
            const data = await spawnPositionSentBy({
                level: fakeLevel({ dimensionTypes: new Map([[sky.id, sky]]) }),
                spawnPoint: { x: 0, y: 100, z: 0, dimension: sky.name, forced: true }
            });

            expect(data?.dimension).toBe(FIRST_CUSTOM_DIMENSION_ID);
        });
    });

    it('sends no Respawn when the player returns to a saved position', async () => {
        // What BDS sends then has not been measured, so nothing is invented for it.
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

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

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

        expect(sent.slice(sent.indexOf('InventoryContent') + 1)).toEqual([
            'RespawnPacket',
            'RespawnPacket',
            'RespawnPacket'
        ]);

        const respawns = packets.filter((packet) => packet instanceof RespawnPacket);
        const payloads = respawns.map((packet) => packet.getPacketData());
        expect(payloads.map((payload) => payload?.state)).toEqual([
            PlayerRespawnState.SEARCHING_FOR_SPAWN,
            PlayerRespawnState.SEARCHING_FOR_SPAWN,
            PlayerRespawnState.READY_TO_SPAWN
        ]);
        expect(payloads.map((payload) => payload?.runtimeEntityId)).toEqual([0n, 0n, 0n]);
        expect(payloads.map((payload) => payload?.position.y)).toEqual([69 + 1.62, 69, 70 + 1.62]);
        expect(payloads[2]?.position.x).toBe(7.5);

        // StartGame reports the requested spot, not the final one.
        const startGame = packets.find((packet): packet is StartGamePacket => packet instanceof StartGamePacket);
        expect(startGame?.getPacketData()?.position).toEqual({ x: 4.5, y: 69 + 1.62, z: -6.5 });
    });

    it('declares what the content build holds in StartGame', async () => {
        const { content } = fixtureJoinPayloads();
        const { packets, server, session } = harness({ content });

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

        // The fixture's two blocks are both in the client's palette and
        // neither is one Mojang defines in data, so the registries declare an
        // empty list where the captured path would have sent all 98.
        const startGame = packets.find((packet): packet is StartGamePacket => packet instanceof StartGamePacket);
        expect(startGame?.getPacketData()?.blockProperties).toEqual([]);
    });

    it('announces the block breaking mode the config chose in StartGame', async () => {
        for (const serverAuthoritativeBreaking of [true, false]) {
            const { packets, server, session } = harness({ serverAuthoritativeBreaking });

            await new ResourcePackClientResponseHandler().handle(
                response(ResourcePackStatus.Completed),
                server,
                session
            );

            const startGame = packets.find((packet): packet is StartGamePacket => packet instanceof StartGamePacket);
            expect(startGame?.getPacketData()?.serverAuthoritativeBlockBreaking).toBe(serverAuthoritativeBreaking);
        }
    });

    it('sends the content build item registry', async () => {
        const { content, payloads } = fixtureJoinPayloads();
        const { packets, server, session } = harness({ content });

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

        const items = packets.find((packet) => packet instanceof ItemRegistryPacket);
        expect(items?.getPacketData()?.items).toEqual(payloads.items);
    });

    /**
     * The registry is server-authoritative, so the numbering the join sends is the numbering
     * for the rest of the session. 1.26.60 moved 82 runtime ids and added four names; a 2225
     * session sent 2193's would disagree with every other 1.26.60 server about where those 82
     * sit. See docs/research/protocol-2225-delta.md.
     */
    it('sends the item registry built for the protocol the session negotiated', async () => {
        const { content, payloads } = fixtureJoinPayloads();
        const at2225 = payloadsFor(content, Codec2225);
        expect(at2225.items).not.toBe(payloads.items);

        const sentTo = async (codec: ProtocolCodec) => {
            const { packets, server, session } = harness({ content, codec });
            await new ResourcePackClientResponseHandler().handle(
                response(ResourcePackStatus.Completed),
                server,
                session
            );

            return packets.find((packet) => packet instanceof ItemRegistryPacket)?.getPacketData()?.items;
        };

        expect(await sentTo(Codec2193)).toEqual(payloads.items);
        expect(await sentTo(Codec2225)).toEqual(at2225.items);
    });

    it('sends nothing game-related before StartGame', async () => {
        // The player list and the time used to go out first. A client that has not had
        // StartGame has no world to apply them to.
        const { sent, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

        expect(sent.slice(0, sent.indexOf('StartGamePacket'))).toEqual(['JigsawStructureDataPacket']);
    });

    it('announces the join once, after everything else', async () => {
        const { sent, emit, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

        expect(emit).toHaveBeenCalledOnce();
        expect(emit.mock.calls[0]?.[0]).toBe('chat');
        expect(sent.at(-1)).toBe('InventoryContent');
    });

    it('kicks a player that refuses the packs, with the resource pack reason', async () => {
        const { sent, kick, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Refused), server, session);

        expect(kick).toHaveBeenCalledOnce();
        expect(kick.mock.calls[0]?.[1]).toBe(DisconnectReason.RESOURCE_PACK_PROBLEM);
        expect(sent).toEqual([]);
    });

    it('kicks a player that asks for packs, since the server offers none', async () => {
        // A `ResourcePackDataInfo` per pack is the answer once the server serves packs. Until
        // then a client waiting for one would sit on the loading screen until RakNet times out.
        const { sent, kick, debug, server, session } = harness();

        await new ResourcePackClientResponseHandler().handle(
            response(ResourcePackStatus.SendPacks, ['a_1.0.0', 'b_2.0.0']),
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

        await handler.handle(response(ResourcePackStatus.Completed), server, session);
        const afterFirst = [...sent];
        await handler.handle(response(ResourcePackStatus.Completed), server, session);

        expect(sent).toEqual(afterFirst);
        expect(emit).toHaveBeenCalledOnce();
    });

    it('sends no second pack stack once the join has started', async () => {
        const { sent, server, session } = harness();
        const handler = new ResourcePackClientResponseHandler();

        await handler.handle(response(ResourcePackStatus.Completed), server, session);
        const afterJoin = [...sent];
        await handler.handle(response(ResourcePackStatus.HaveAllPacks), server, session);

        expect(sent).toEqual(afterJoin);
    });

    it('keeps the join per session', async () => {
        // The guard is keyed on the session, not on the handler: a second player joining
        // through the same handler instance still gets its burst.
        const first = harness();
        const second = harness();
        const handler = new ResourcePackClientResponseHandler();

        await handler.handle(response(ResourcePackStatus.Completed), first.server, first.session);
        await handler.handle(response(ResourcePackStatus.Completed), second.server, second.session);

        expect(second.sent).toEqual(first.sent);
        expect(second.sent).toContain('StartGamePacket');
    });

    it('sends nothing when a subscriber cancels the spawn', async () => {
        const { sent, emit, server, session } = harness({ cancelSpawn: true });

        await new ResourcePackClientResponseHandler().handle(response(ResourcePackStatus.Completed), server, session);

        expect(sent).toEqual([]);
        expect(emit).not.toHaveBeenCalled();
    });
});
