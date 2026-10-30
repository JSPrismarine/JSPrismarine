import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import BlockPosition from '../../world/BlockPosition';
import AddActorPacket from '@jsprismarine/protocol/packet/AddActorPacket';
import { AddPlayerPacket, emptyItemStackDescriptor } from '@jsprismarine/protocol';
import type { AddPlayerPayload } from '@jsprismarine/protocol';
import AnimatePacket from '@jsprismarine/protocol/packet/AnimatePacket';
import InventoryTransactionPacket from '@jsprismarine/protocol/packet/InventoryTransactionPacket';
import { HandSlot, TransactionType } from '@jsprismarine/protocol';
import ItemRegistryPacket from '@jsprismarine/protocol/packet/ItemRegistryPacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import { BuildPlatform } from '@jsprismarine/minecraft';
import PlayerListPacket from '@jsprismarine/protocol/packet/PlayerListPacket';
import { PlayerListAction, PlayerListEntry } from '@jsprismarine/protocol/wire/structures/PlayerListEntry';
import PlayerSkinPacket from '@jsprismarine/protocol/packet/PlayerSkinPacket';
import Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import Codec2193 from './Codec2193';
import Codec2225 from './Codec2225';
import { codecForProtocol, latestCodec } from './CodecRegistry';
import { packetIds as packetIds2193 } from '@jsprismarine/protocol/wire/versions/v2193';
import { addedPacketIds } from '@jsprismarine/protocol/wire/versions/v2225';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

/** Encodes under the 2225 codec's id, then decodes through the codec, as a session would. */
const roundTrip = <T extends NetworkPacket>(packet: T): T => {
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
                // A 2225 session builds one; a 2193 codec has no id for it at all, so an
                // older session can neither ask for it nor be sent one.
                const packet = Codec2225.createPacket(id);
                expect(packet, name).not.toBeNull();
                expect(packet!.getName(), name).toBe(name);
                expect(packet!.codecProtocol, name).toBe(2225);
            }

            const ids = Object.values(Codec2225.ids);
            expect(new Set(ids).size).toBe(ids.length);
        });

        it('builds one class per packet at every version, stamped with its own protocol', () => {
            // The packets whose wire changed at 2225 carry the difference as data: the same
            // class decodes under both codecs, and the stamp picks the layout.
            for (const name of ['StartGamePacket', 'LevelChunkPacket', 'PlayerListPacket', 'SetTimePacket']) {
                const at2225 = Codec2225.createPacket(Codec2225.netIdOf(name)!)!;
                const at2193 = Codec2193.createPacket(Codec2193.netIdOf(name)!)!;
                expect(at2225.constructor, name).toBe(at2193.constructor);
                expect(at2225.getName(), name).toBe(name);
                expect(at2225.codecProtocol, name).toBe(2225);
                expect(at2193.codecProtocol, name).toBe(2193);
            }
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
            const packet = new LevelChunkPacket({
                chunkX: 4,
                chunkZ: -3,
                dimension: 0,
                subChunkCount: 2,
                clientSubChunkRequestsEnabled: false,
                cached: false,
                payload: Buffer.from([1, 2, 3]),
                isClientBiomeUpdate: true
            });
            packet.codecProtocol = 2225;

            const decoded = roundTrip(packet);
            expect(decoded.getPacketData()).toMatchObject({ chunkX: 4, chunkZ: -3, isClientBiomeUpdate: true });
            expect(decoded.getPacketData()?.payload).toStrictEqual(Buffer.from([1, 2, 3]));
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
            const data: AddPlayerPayload = {
                uuid: UUID.fromString('00000000-0000-4000-8000-000000000001'),
                name: 'Steve',
                runtimeEntityId: 3n,
                platformChatId: '',
                position: new Vector3(0, 5, 0),
                motion: new Vector3(0, 0, 0),
                pitch: 0,
                yaw: 0,
                headYaw: 0,
                carriedItem: {
                    id: 0,
                    stackSize: 0,
                    auxValue: 0,
                    stackNetId: null,
                    blockRuntimeId: 0,
                    userData: Buffer.alloc(0)
                },
                gamemode: 0,
                metadata: new Metadata(false),
                syncedProperties: new SyncedProperties(),
                abilities: { targetPlayerRawId: 3n, playerPermission: 0, commandPermission: 0, layers: [] },
                links: [],
                passengerOfBlock: {
                    blockPosition: new Vector3(0, 0, 0),
                    offset: new Vector3(0, 0, 0),
                    rotation: 0,
                    rotationLimit: 0,
                    emoteType: 0
                },
                deviceId: 'device',
                buildPlatform: -1
            };
            const packet = new AddPlayerPacket(data);
            packet.codecProtocol = 2225;

            const decoded = roundTrip(packet);
            // The device id still reads correctly from behind the inserted optional.
            expect(decoded.getPacketData()).toMatchObject({ name: 'Steve', deviceId: 'device' });
            expect(decoded.getPacketData()).toMatchObject({ passengerOfBlock: data.passengerOfBlock });
        });

        it('round-trips the Hand byte both changed transaction bodies gained', () => {
            const useOnActor = new InventoryTransactionPacket({
                legacyRequest: { legacyRequestId: 0, legacySlotChanges: [] },
                transactionType: TransactionType.USE_ITEM_ON_ENTITY,
                inventoryActions: [],
                hand: HandSlot.OFFHAND,
                transactionData: {
                    kind: 'useItemOnEntity',
                    entityRuntimeId: 42n,
                    actionType: 1,
                    hotbarSlot: 2,
                    itemInHand: emptyItemStackDescriptor(),
                    playerPosition: new Vector3(0, 64, 0),
                    clickPosition: new Vector3(0.5, 1, 0.5)
                }
            });
            useOnActor.codecProtocol = 2225;
            const decodedUse = roundTrip(useOnActor);
            expect(decodedUse.getPacketData()).toMatchObject({
                hand: HandSlot.OFFHAND,
                transactionData: { entityRuntimeId: 42n, hotbarSlot: 2 }
            });

            const release = new InventoryTransactionPacket({
                legacyRequest: { legacyRequestId: 0, legacySlotChanges: [] },
                transactionType: TransactionType.RELEASE_ITEM,
                inventoryActions: [],
                hand: HandSlot.OFFHAND,
                transactionData: {
                    kind: 'releaseItem',
                    actionType: 0,
                    hotbarSlot: 3,
                    itemInHand: emptyItemStackDescriptor(),
                    playerPosition: new Vector3(1.5, 64, -2.25)
                }
            });
            release.codecProtocol = 2225;
            const decodedRelease = roundTrip(release);
            expect(decodedRelease.getPacketData()).toMatchObject({
                hand: HandSlot.OFFHAND,
                transactionData: { hotbarSlot: 3 }
            });
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
