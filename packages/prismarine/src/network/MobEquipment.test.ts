/**
 * What a client is told about a mob's equipment, down to the bytes.
 *
 * `PlayerSessionEquipment.test.ts` covers the human path, which reads an armor container. This
 * covers the mob path, which reads the slot record on the entity itself, and pins the encoding
 * of both packets: they are positional, so a slot written in the wrong order or left out is a
 * client reading the next field's bytes as this one's.
 */
import { WindowIds } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import type { ViewableEquipment } from '../entity/predicateView';
import { Item } from '../item/Item';
import { stub } from '../testing/stub.test.helper';
import type Player from '../Player';
import type ClientConnection from './ClientConnection';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { MobArmorEquipmentPacket, MobEquipmentPacket } from '@jsprismarine/protocol';
import type { ProtocolContext } from '@jsprismarine/protocol';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import PlayerSession from './PlayerSession';

const protocolContext: ProtocolContext = { protocolVersion: 2193 };
const protocolCodec = stub<ProtocolCodec>({ protocolVersion: 2193, context: protocolContext });

const packetData = <T>(packet: NetworkPacket<T>): T => {
    const data = packet.getPacketData();
    if (data === null) throw new Error(`${packet.getName()} has no payload`);
    return data;
};

/** A session whose connection records what goes out. */
const recordingSession = () => {
    const sent: NetworkPacket[] = [];
    const connection = stub<ClientConnection>({
        codec: protocolCodec,
        sendDataPacket: async (packet) => void sent.push(packet)
    });

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        player: stub<Player>()
    });

    return { session, sent };
};

/** A mob whose equipment is the given set, which is all the send reads off it. */
const mob = (equipment: ViewableEquipment): Entity =>
    stub<Entity>({
        getRuntimeId: () => 42n,
        getEquipment: () => equipment
    });

/** The packet at a position, reported as itself when it is missing. */
const nth = <T>(packets: readonly T[], index: number, what: string): T => {
    const packet = packets[index];
    if (packet === undefined) throw new Error(`no ${what} at ${index}: ${packets.length} went out`);
    return packet;
};

describe('network', () => {
    describe('PlayerSession.sendEquipmentFor', () => {
        it('sends the worn slots and the main hand, and nothing for an empty off hand', async () => {
            const { session, sent } = recordingSession();

            await session.sendEquipmentFor(mob({ mainhand: new Item({ name: 'minecraft:bow', count: 1 }) }));

            // Two packets, not three: an off hand nothing is in is not worth a packet.
            expect(sent).toHaveLength(2);
            expect(sent[0]).toBeInstanceOf(MobArmorEquipmentPacket);
            expect(sent[1]).toBeInstanceOf(MobEquipmentPacket);
        });

        it('sends the armor before the hand, so a client dresses the mob it just spawned', async () => {
            const { session, sent } = recordingSession();

            await session.sendEquipmentFor(
                mob({
                    head: new Item({ name: 'minecraft:iron_helmet', count: 1 }),
                    mainhand: new Item({ name: 'minecraft:iron_sword', count: 1 }),
                    offhand: new Item({ name: 'minecraft:shield', count: 1 })
                })
            );

            expect(sent).toHaveLength(3);
            expect(sent.map((packet) => packet.constructor.name)).toEqual([
                'MobArmorEquipmentPacket',
                'MobEquipmentPacket',
                'MobEquipmentPacket'
            ]);
        });

        it('writes every worn slot, filling the empty ones with air', async () => {
            // The packet is positional and fixed width. A client sent three pieces reads the
            // next packet's bytes as the fourth, which is why an empty slot travels as air
            // rather than being left out.
            const { session, sent } = recordingSession();

            await session.sendEquipmentFor(mob({ chest: new Item({ name: 'minecraft:iron_chestplate', count: 1 }) }));

            const armor = nth(
                sent.filter((packet) => packet instanceof MobArmorEquipmentPacket),
                0,
                'MobArmorEquipmentPacket'
            );

            const data = packetData(armor);
            expect(data.runtimeEntityId).toBe(42n);
            expect(Item.fromStackDescriptor(protocolContext, data.head).getName()).toBe('minecraft:air');
            expect(Item.fromStackDescriptor(protocolContext, data.chest).getName()).toBe('minecraft:iron_chestplate');
            expect(Item.fromStackDescriptor(protocolContext, data.legs).getName()).toBe('minecraft:air');
            expect(Item.fromStackDescriptor(protocolContext, data.feet).getName()).toBe('minecraft:air');
            // Horse armor, llama carpet and wolf armor; no equipment table rolls one.
            expect(Item.fromStackDescriptor(protocolContext, data.body).getName()).toBe('minecraft:air');
        });

        it('names the mob slot fields the way vanilla does for an entity with no inventory', async () => {
            const { session, sent } = recordingSession();

            await session.sendEquipmentFor(mob({ mainhand: new Item({ name: 'minecraft:bow', count: 1 }) }));

            const hand = nth(
                sent.filter((packet) => packet instanceof MobEquipmentPacket),
                0,
                'MobEquipmentPacket'
            );

            const data = packetData(hand);
            expect(data.runtimeEntityId).toBe(42n);
            expect(Item.fromStackDescriptor(protocolContext, data.item).getName()).toBe('minecraft:bow');
            // A mob has no inventory to name a slot in, and the hand is container 0 rather
            // than the player inventory's 0x00 window.
            expect(data.inventorySlot).toBe(0);
            expect(data.hotbarSlot).toBe(0);
            expect(data.windowId).toBe(0);
        });

        it('sends the off hand for the offhand container when something is in it', async () => {
            const { session, sent } = recordingSession();

            await session.sendEquipmentFor(
                mob({
                    mainhand: new Item({ name: 'minecraft:bow', count: 1 }),
                    offhand: new Item({ name: 'minecraft:shield', count: 1 })
                })
            );

            const offhand = nth(
                sent.filter((packet) => packet instanceof MobEquipmentPacket),
                1,
                'off-hand MobEquipmentPacket'
            );

            const data = packetData(offhand);
            expect(Item.fromStackDescriptor(protocolContext, data.item).getName()).toBe('minecraft:shield');
            expect(data.windowId).toBe(WindowIds.OFFHAND);
            expect(data.inventorySlot).toBe(0);
            expect(data.hotbarSlot).toBe(0);
        });

        it('clears the main hand with air rather than by saying nothing', async () => {
            // A mob that put its item down has to be told about: leaving the hand unsent would
            // leave the client drawing whatever it was last given.
            const { session, sent } = recordingSession();

            await session.sendEquipmentFor(mob({}));

            const hand = nth(
                sent.filter((packet) => packet instanceof MobEquipmentPacket),
                0,
                'MobEquipmentPacket'
            );

            expect(Item.fromStackDescriptor(protocolContext, packetData(hand).item).getName()).toBe('minecraft:air');
        });
    });

    describe('the bytes a mob equipment packet travels as', () => {
        /** How many bytes an empty slot occupies: what `Item.air()` serializes to. */
        const AIR_BYTES = 8;

        it('writes the id, the item and the three slot fields in that order', () => {
            const packet = new MobEquipmentPacket({
                runtimeEntityId: 42n,
                item: Item.air().toStackDescriptor(protocolContext),
                inventorySlot: 1,
                hotbarSlot: 2,
                windowId: WindowIds.OFFHAND
            });
            packet.encode();

            // The whole packet: header, then payload. The three slot fields are single bytes at
            // the end, which is what distinguishes the off-hand send from the main-hand one.
            expect([...packet.getBuffer()]).toEqual([
                0x1f, // MobEquipmentPacket
                0x2a, // runtime entity id 42, unsigned varlong
                ...new Array<number>(AIR_BYTES).fill(0x00), // the item: air
                0x01, // inventory slot
                0x02, // hotbar slot
                0x77 // window id 119, the offhand container
            ]);
        });

        it('writes the item a mob is holding where the client reads one', () => {
            const packet = new MobEquipmentPacket({
                runtimeEntityId: 42n,
                item: new Item({ name: 'minecraft:bow', count: 1 }).toStackDescriptor(protocolContext),
                inventorySlot: 0,
                hotbarSlot: 0,
                windowId: 0
            });
            packet.encode();

            const bytes = packet.getBuffer();
            // A held bow is longer than the empty-handed packet by exactly the item, and the
            // three zero slot bytes still close it.
            expect(bytes.length).toBeGreaterThan(2 + AIR_BYTES + 3);
            expect([...bytes.subarray(0, 2)]).toEqual([0x1f, 0x2a]);
            expect([...bytes.subarray(bytes.length - 3)]).toEqual([0x00, 0x00, 0x00]);
        });

        it('round trips through its own decode', () => {
            const written = new MobEquipmentPacket({
                runtimeEntityId: 300n,
                item: Item.air().toStackDescriptor(protocolContext),
                inventorySlot: 1,
                hotbarSlot: 2,
                windowId: WindowIds.OFFHAND
            });
            written.encode();

            const read = new MobEquipmentPacket(null, written.getBuffer());
            read.decode();

            const data = packetData(read);
            expect(data.runtimeEntityId).toBe(300n);
            expect(data.inventorySlot).toBe(1);
            expect(data.hotbarSlot).toBe(2);
            expect(data.windowId).toBe(WindowIds.OFFHAND);
        });

        it('writes all five worn slots, so none of them reads the next field', () => {
            const air = Item.air().toStackDescriptor(protocolContext);
            const packet = new MobArmorEquipmentPacket({
                runtimeEntityId: 42n,
                head: air,
                chest: air,
                legs: air,
                feet: air,
                body: air
            });
            packet.encode();

            // The header, the id, and five air items. A send that left an empty slot out would
            // be eight bytes shorter, and the client would read the batch's next bytes as the
            // missing piece.
            expect([...packet.getBuffer()]).toEqual([
                0x20, // MobArmorEquipmentPacket
                0x2a, // runtime entity id 42
                ...new Array<number>(AIR_BYTES * 5).fill(0x00)
            ]);
        });
    });
});
