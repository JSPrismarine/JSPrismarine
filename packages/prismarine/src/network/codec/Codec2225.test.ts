import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import GameRuleManager from '../../world/GameRuleManager';
import BlockPosition from '../../world/BlockPosition';
import { Item } from '../../item/Item';
import AddActorPacket from '../packet/AddActorPacket';
import AddPlayerPacket from '../packet/AddPlayerPacket';
import AnimatePacket from '../packet/AnimatePacket';
import InventoryTransactionPacket, { HandSlot, TransactionType } from '../packet/InventoryTransactionPacket';
import ItemRegistryPacket from '../packet/ItemRegistryPacket';
import LevelChunkPacket from '../packet/LevelChunkPacket';
import { Metadata } from '../../entity/Metadata';
import { BuildPlatform } from '@jsprismarine/minecraft';
import PlayerListPacket, { PlayerListAction, PlayerListEntry } from '../packet/PlayerListPacket';
import PlayerSkinPacket from '../packet/PlayerSkinPacket';
import Skin from '../../utils/skin/Skin';
import StartGamePacket2225 from '../packet/StartGamePacket2225';
import UUID from '../../utils/UUID';
import Codec2193 from './Codec2193';
import Codec2225 from './Codec2225';
import { codecForProtocol, latestCodec } from './CodecRegistry';
import { packetIds as packetIds2193 } from './v2193';
import { addedPacketIds } from './v2225';
import type DataPacket from '../packet/DataPacket';

/** Encodes under the 2225 codec's id, then decodes through the codec, as a session would. */
const roundTrip = <T extends DataPacket>(packet: T): T => {
    packet.setNetId(Codec2225.netIdOf(packet.getName())!);
    packet.encode();

    const decoded = Codec2225.createPacket(Codec2225.netIdOf(packet.getName())!, packet.getBuffer());
    expect(decoded).toBeInstanceOf(packet.constructor);
    decoded!.decode();
    expect(decoded!.feof()).toBe(true);
    return decoded as T;
};

describe('network/codec', () => {
    describe('Codec2225', () => {
        it('speaks protocol 2225 for 1.26.60, and the registry names it the latest', () => {
            expect(Codec2225.protocolVersion).toBe(2225);
            expect(Codec2225.minecraftVersions).toStrictEqual(['1.26.60']);
            expect(codecForProtocol(2225)).toBe(Codec2225);
            expect(latestCodec).toBe(Codec2225);
        });

        it('carries the 2193 table plus the eight packets 1.26.60 added, renumbering nothing', () => {
            for (const [name, id] of Object.entries(packetIds2193)) {
                expect(Codec2225.netIdOf(name), name).toBe(id);
            }
            for (const [name, id] of Object.entries(addedPacketIds)) {
                expect(Codec2225.netIdOf(name), name).toBe(id);
                expect(Codec2193.netIdOf(name), name).toBeUndefined();
                // Protocol surface without a class yet: known id, no packet to build.
                expect(Codec2225.createPacket(id), name).toBeNull();
            }

            const ids = Object.values(Codec2225.ids);
            expect(new Set(ids).size).toBe(ids.length);
        });

        it('builds its own class for every changed packet, under the 2193 class for the rest', () => {
            const changed = {
                StartGamePacket: StartGamePacket2225
            };
            for (const [name, packetClass] of Object.entries(changed)) {
                const packet = Codec2225.createPacket(Codec2225.netIdOf(name)!);
                expect(packet, name).toBeInstanceOf(packetClass);
                // The subclass answers to the base name, so handlers and id lookups by name
                // never see the version suffix.
                expect(packet!.getName(), name).toBe(name);
                expect(packet!.codecProtocol, name).toBe(2225);

                const packet2193 = Codec2193.createPacket(Codec2193.netIdOf(name)!);
                expect(packet2193, name).not.toBeInstanceOf(packetClass);
            }

            const unchanged = Codec2225.createPacket(Codec2225.netIdOf('SetTimePacket')!)!;
            const inherited = Codec2193.createPacket(Codec2193.netIdOf('SetTimePacket')!)!;
            expect(unchanged.constructor).toBe(inherited.constructor);
            expect(unchanged.getName()).toBe('SetTimePacket');
        });

        it('round-trips the trailing Hand byte AnimatePacket gained', () => {
            // Animate has one class at every version; the stamped protocol picks the layout,
            // exactly as `prepareOutbound` stamps a session's outbound packets.
            const packet = new AnimatePacket();
            packet.codecProtocol = 2225;
            packet.action = 1;
            packet.runtimeEntityId = 300n;
            packet.swingSource = 'attack';
            packet.hand = HandSlot.OFFHAND;

            expect(roundTrip(packet)).toMatchObject({ action: 1, swingSource: 'attack', hand: HandSlot.OFFHAND });
        });

        it('round-trips the trailing Is Client Biome Update boolean LevelChunkPacket gained', () => {
            // One class at every version; the stamped protocol picks the layout, exactly as
            // `prepareOutbound` stamps a session's outbound packets.
            const packet = new LevelChunkPacket();
            packet.codecProtocol = 2225;
            packet.chunkX = 4;
            packet.chunkZ = -3;
            packet.subChunkCount = 2;
            packet.data = Buffer.from([1, 2, 3]);
            packet.isClientBiomeUpdate = true;

            const decoded = roundTrip(packet);
            expect(decoded).toMatchObject({ chunkX: 4, chunkZ: -3, isClientBiomeUpdate: true });
            expect(decoded.data).toStrictEqual(Buffer.from([1, 2, 3]));
        });

        it('round-trips the Editor Level Migration Version int8 StartGamePacket gained', () => {
            const packet = new StartGamePacket2225();
            packet.entityId = -2n;
            packet.runtimeEntityId = 7n;
            packet.gamemode = 1;
            packet.playerPos = new Vector3(0.5, 64, -2);
            packet.pitch = 1;
            packet.yaw = 180;
            packet.seed = 258n;
            packet.worldSpawnPos = new Vector3(8, -60, -16);
            packet.gameRules = new GameRuleManager(stub<Server>());
            packet.time = 6000;
            packet.levelId = 'level-id';
            packet.worldName = 'A world';
            packet.serverIdentifier = 'JSPrismarine';
            packet.scenarioIdentifier = 'scenario';
            packet.worldIdentifier = 'world-id';
            packet.editorLevelMigrationVersion = 1;

            const decoded = roundTrip(packet);
            // Day Cycle Stop Time is the field right behind the insertion, so its survival
            // says the int8 moved the later fields by exactly one.
            expect(decoded).toMatchObject({ time: 6000, editorLevelMigrationVersion: 1 });
        });

        it('round-trips the trailing Passenger Block Data AddActorPacket gained', () => {
            const packet = new AddActorPacket();
            packet.codecProtocol = 2225;
            packet.runtimeEntityId = 12n;
            packet.type = 'minecraft:cow';
            packet.pitch = 0;
            packet.yaw = 90;
            packet.headYaw = 90;
            packet.metadata = new Metadata();
            packet.passengerOfBlock = {
                blockPosition: new BlockPosition(1, -60, 2),
                offset: new Vector3(0.5, 1, -0.5),
                rotation: 180,
                rotationLimit: 90,
                emoteType: 1
            };

            const decoded = roundTrip(packet);
            expect(decoded.passengerOfBlock).toMatchObject({ rotation: 180, rotationLimit: 90, emoteType: 1 });
            expect(decoded.passengerOfBlock!.blockPosition.getY()).toBe(-60);

            packet.passengerOfBlock = null;
            expect(roundTrip(packet).passengerOfBlock).toBeNull();
        });

        it('round-trips the Passenger Block Data AddPlayerPacket gained before the device id', () => {
            const packet = new AddPlayerPacket();
            packet.codecProtocol = 2225;
            packet.uuid = UUID.fromString('00000000-0000-4000-8000-000000000001');
            packet.name = 'Steve';
            packet.runtimeEntityId = 3n;
            packet.platformChatId = '';
            packet.pitch = 0;
            packet.yaw = 0;
            packet.headYaw = 0;
            packet.deviceId = 'device';
            packet.passengerOfBlock = {
                blockPosition: new BlockPosition(0, 0, 0),
                offset: new Vector3(0, 0, 0),
                rotation: 0,
                rotationLimit: 0,
                emoteType: 0
            };

            const decoded = roundTrip(packet);
            // The device id still reads correctly from behind the inserted optional.
            expect(decoded).toMatchObject({ name: 'Steve', deviceId: 'device' });
            expect(decoded.passengerOfBlock).not.toBeNull();
        });

        it('round-trips the Hand byte both changed transaction bodies gained', () => {
            const useOnActor = new InventoryTransactionPacket();
            useOnActor.codecProtocol = 2225;
            useOnActor.legacyRequestId = 0;
            useOnActor.legacySlotChanges = [];
            useOnActor.inventoryActions = [];
            useOnActor.transactionType = TransactionType.USE_ITEM_ON_ENTITY;
            useOnActor.hand = HandSlot.OFFHAND;
            useOnActor.transactionData = {
                kind: 'useItemOnEntity',
                entityRuntimeId: 42n,
                actionType: 1,
                hotbarSlot: 2,
                itemInHand: Item.air(),
                playerPosition: new Vector3(0, 64, 0),
                clickPosition: new Vector3(0.5, 1, 0.5)
            };
            const decodedUse = roundTrip(useOnActor);
            expect(decodedUse.hand).toBe(HandSlot.OFFHAND);
            expect(decodedUse.transactionData).toMatchObject({ entityRuntimeId: 42n, hotbarSlot: 2 });

            const release = new InventoryTransactionPacket();
            release.codecProtocol = 2225;
            release.legacyRequestId = 0;
            release.legacySlotChanges = [];
            release.inventoryActions = [];
            release.transactionType = TransactionType.RELEASE_ITEM;
            release.hand = HandSlot.OFFHAND;
            release.transactionData = {
                kind: 'releaseItem',
                actionType: 0,
                hotbarSlot: 3,
                itemInHand: Item.air(),
                playerPosition: new Vector3(1.5, 64, -2.25)
            };
            const decodedRelease = roundTrip(release);
            expect(decodedRelease.hand).toBe(HandSlot.OFFHAND);
            expect(decodedRelease.transactionData).toMatchObject({ hotbarSlot: 3 });
        });

        describe('the PlayFab id move', () => {
            const skin = () =>
                Skin.fromJWT({
                    SkinId: 'classic-skin',
                    CapeId: '',
                    SkinResourcePatch: '',
                    PlayFabId: 'PFID-abc123',
                    SkinImageHeight: 1,
                    SkinImageWidth: 1,
                    SkinGeometryData: '',
                    SkinAnimationData: '',
                    CapeImageHeight: 0,
                    CapeImageWidth: 0,
                    CapeOnClassicSkin: false,
                    SkinData: Buffer.from([0, 0, 0, 255]).toString('base64'),
                    CapeData: '',
                    PremiumSkin: false,
                    PersonaSkin: false,
                    SkinColor: '#0',
                    ArmSize: 'wide',
                    AnimatedImageData: [],
                    PersonaPieces: [],
                    PieceTintColors: []
                });

            const addPacket = <T extends PlayerListPacket>(packet: T): T => {
                packet.type = PlayerListAction.TYPE_ADD;
                packet.entries = [
                    new PlayerListEntry({
                        uuid: UUID.fromString('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'),
                        runtimeId: 11n,
                        name: 'Terracotta',
                        xuid: '2535',
                        platformChatId: '',
                        buildPlatform: BuildPlatform.WIN32,
                        skin: skin()
                    })
                ];
                return packet;
            };

            /**
             * The regression this whole subclass exists for. A 2225 client reads the entry's
             * PlayFab id before the platform online id, so against 2193 bytes it is a string
             * short by the time it reaches `Build Platform` - four fixed little-endian bytes
             * it then reads as a string length. The read runs away and the join dies with the
             * connection rather than a named reason, which the client shows as "Terracotta".
             */
            it('a 2225 reader cannot parse the 2193 entry layout', () => {
                const legacy = addPacket(new PlayerListPacket());
                legacy.setNetId(Codec2225.netIdOf('PlayerListPacket')!);
                legacy.encode();

                const reader = new PlayerListPacket(legacy.getBuffer());
                reader.codecProtocol = 2225;
                // Either it throws reading past the buffer, or it survives with a desynced
                // read that leaves the stream unconsumed. Both end the client's join.
                let parsed = true;
                try {
                    reader.decode();
                } catch {
                    parsed = false;
                }
                expect(parsed && reader.feof()).toBe(false);
            });

            it('carries the PlayFab id on the entry at 2225 and inside the skin at 2193', () => {
                const packet2225 = addPacket(new PlayerListPacket());
                packet2225.codecProtocol = 2225;
                const at2225 = roundTrip(packet2225);
                expect(at2225.entries[0]!.getSkin()!.getPlayFabId()).toBe('PFID-abc123');
                expect(at2225.entries[0]!.getName()).toBe('Terracotta');
                expect(at2225.entries[0]!.getBuildPlatform()).toBe(BuildPlatform.WIN32);

                const legacy = addPacket(new PlayerListPacket());
                legacy.setNetId(Codec2193.netIdOf('PlayerListPacket')!);
                legacy.encode();
                const at2193 = new PlayerListPacket(legacy.getBuffer());
                at2193.decode();
                expect(at2193.feof()).toBe(true);
                expect(at2193.entries[0]!.getSkin()!.getPlayFabId()).toBe('PFID-abc123');

                // The same fields, a different layout: the move is real, not a no-op.
                expect(at2225.getBuffer().equals(legacy.getBuffer())).toBe(false);
            });

            it('stamps the player list packet, whose layout the stamp alone selects', () => {
                const list = addPacket(new PlayerListPacket());
                expect(Codec2225.prepareOutbound(list)).toBe(list);
                expect(list.codecProtocol).toBe(2225);
                expect(list.entries).toHaveLength(1);
            });

            it('round-trips a skin packet whose skin no longer carries the id', () => {
                const packet = new PlayerSkinPacket();
                packet.codecProtocol = 2225;
                packet.uuid = UUID.fromString('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0');
                packet.skin = skin();
                packet.newSkinName = 'new';
                packet.oldSkinName = 'old';

                const decoded = roundTrip(packet);
                expect(decoded.newSkinName).toBe('new');
                expect(decoded.skin.getId()).toBe('classic-skin');
                // Dropped from the wire at 2225, so it reads back empty rather than undefined.
                expect(decoded.skin.getPlayFabId()).toBe('');
            });
        });

        /**
         * The data half of a version, beside the layouts. A packet whose class is the same at
         * both versions but whose payload numbers items - `ItemRegistryPacket`, and every
         * packet carrying a stack - reads the stamp rather than a global constant, so an
         * outbound packet has to be stamped whether or not its class was substituted.
         */
        describe('the version stamp on an outbound packet', () => {
            it('stamps a packet whose class the codec did not substitute', () => {
                const registry = new ItemRegistryPacket();
                expect(Codec2225.prepareOutbound(registry)).toBe(registry);
                expect(registry.codecProtocol).toBe(2225);

                expect(Codec2193.prepareOutbound(registry)).toBe(registry);
                expect(registry.codecProtocol).toBe(2193);
            });

            it('stamps a layout-walking packet, which needs nothing but the stamp', () => {
                const chunk = new LevelChunkPacket();
                expect(Codec2225.prepareOutbound(chunk)).toBe(chunk);
                expect(chunk.codecProtocol).toBe(2225);
            });
        });
    });
});
