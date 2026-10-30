import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import { FlagType, Metadata, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import { Item } from '../../item/Item';
import AddItemActorPacket from './AddItemActorPacket';

/**
 * The 2193 layout written out by hand in docs order. The three parameters are the slots the
 * second test changes; everything else is fixed so a shifted field fails the whole comparison.
 */
const expectedBytes = (slots: { targetActorId: number[]; entityData: number[]; isFromFishing: number }): Buffer =>
    Buffer.from([
        // Header: packet id 15.
        0x0f,
        // Target Actor ID, ZigZag varint64.
        ...slots.targetActorId,
        // Target Runtime ID 5.
        0x05,
        // Item: air. int16 id, uint16 count, varuint aux, no stack net id, varuint block runtime id, varuint user data length.
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        // Position (1, 2, 3).
        0x00,
        0x00,
        0x80,
        0x3f,
        0x00,
        0x00,
        0x00,
        0x40,
        0x00,
        0x00,
        0x40,
        0x40,
        // Velocity (0, -1, 0.5).
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x80,
        0xbf,
        0x00,
        0x00,
        0x00,
        0x3f,
        // Entity Data.
        ...slots.entityData,
        // Is From Fishing.
        slots.isFromFishing
    ]);

const buildPacket = (): AddItemActorPacket => {
    const pk = new AddItemActorPacket();
    pk.runtimeEntityId = 5n;
    pk.item = Item.air();
    pk.position = new Vector3(1, 2, 3);
    pk.motion = new Vector3(0, -1, 0.5);
    pk.metadata = new Metadata(false);
    return pk;
};

describe('network', () => {
    describe('packet', () => {
        describe('AddItemActorPacket', () => {
            it('encodes the 2193 layout, using the runtime id as the Target Actor ID when none is set', () => {
                const pk = buildPacket();
                pk.encode();

                expect(pk.getBuffer()).toEqual(
                    expectedBytes({
                        targetActorId: [0x0a], // 5 zigzags to 10
                        entityData: [0x00], // no entries
                        isFromFishing: 0x00
                    })
                );
            });

            it('writes an explicit unique id, one metadata entry and the fishing flag', () => {
                const pk = buildPacket();
                pk.uniqueEntityId = -3n;
                pk.metadata.setPropertyValue(MetadataFlag.COLOR, FlagType.BYTE, 7);
                pk.isFromFishing = true;
                pk.encode();

                expect(pk.getBuffer()).toEqual(
                    expectedBytes({
                        targetActorId: [0x05], // -3 zigzags to 5
                        // One entry: ID 3 (COLOR), one-of selector 0 (Byte), Type 0 again, Value 7.
                        entityData: [0x01, 0x03, 0x00, 0x00, 0x07],
                        isFromFishing: 0x01
                    })
                );
            });

            it('round-trips ids, the item, movement, metadata and the fishing flag', () => {
                const pk = buildPacket();
                pk.uniqueEntityId = -3n;
                pk.metadata.setPropertyValue(MetadataFlag.COLOR, FlagType.BYTE, 7);
                pk.isFromFishing = true;
                pk.encode();

                const decoded = new AddItemActorPacket(pk.getBuffer());
                decoded.decode();

                expect(decoded.uniqueEntityId).toBe(-3n);
                expect(decoded.runtimeEntityId).toBe(5n);
                expect(decoded.item.getName()).toBe('minecraft:air');
                expect(decoded.position).toEqual(new Vector3(1, 2, 3));
                expect(decoded.motion).toEqual(new Vector3(0, -1, 0.5));
                expect(decoded.metadata.getData()).toEqual(pk.metadata.getData());
                expect(decoded.isFromFishing).toBe(true);
                expect(decoded.feof()).toBe(true);
            });
        });
    });
});
