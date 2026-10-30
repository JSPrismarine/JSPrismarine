import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import { Attribute, AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { FlagType, Metadata, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import AddActorPacket, { ActorLinkType } from './AddActorPacket';

/**
 * The 2193 layout written out by hand in docs order. The parameters are the slots the second
 * test changes; everything else is fixed so a shifted field fails the whole comparison.
 */
const expectedBytes = (slots: { targetActorId: number[]; actorData: number[]; actorLinks: number[] }): Buffer =>
    Buffer.from([
        // Header: packet id 13.
        0x0d,
        // Target Actor ID, ZigZag varint64.
        ...slots.targetActorId,
        // Target Runtime ID 2.
        0x02,
        // Actor Type "minecraft:pig".
        0x0d,
        0x6d,
        0x69,
        0x6e,
        0x65,
        0x63,
        0x72,
        0x61,
        0x66,
        0x74,
        0x3a,
        0x70,
        0x69,
        0x67,
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
        // Velocity (0, 0, 0).
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        // Rotation: pitch 10, yaw 20.
        0x00,
        0x00,
        0x20,
        0x41,
        0x00,
        0x00,
        0xa0,
        0x41,
        // Y Head Rotation 30.
        0x00,
        0x00,
        0xf0,
        0x41,
        // Y Body Rotation, written from yaw: 20.
        0x00,
        0x00,
        0xa0,
        0x41,
        // Attributes List: one entry.
        0x01,
        // Attribute Name "minecraft:health".
        0x10,
        0x6d,
        0x69,
        0x6e,
        0x65,
        0x63,
        0x72,
        0x61,
        0x66,
        0x74,
        0x3a,
        0x68,
        0x65,
        0x61,
        0x6c,
        0x74,
        0x68,
        // Min Value 0, Current Value 10, Max Value 20.
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x20,
        0x41,
        0x00,
        0x00,
        0xa0,
        0x41,
        // Actor Data.
        ...slots.actorData,
        // Synched Properties: no int entries, no float entries.
        0x00,
        0x00,
        // Actor Links.
        ...slots.actorLinks
    ]);

const buildPacket = (): AddActorPacket => {
    const pk = new AddActorPacket();
    pk.runtimeEntityId = 2n;
    pk.type = 'minecraft:pig';
    pk.position = new Vector3(1, 2, 3);
    pk.pitch = 10;
    pk.yaw = 20;
    pk.headYaw = 30;
    pk.attributes = [new Attribute({ name: AttributeIds.Health, min: 0, max: 20, def: 20, value: 10 })];
    pk.metadata = new Metadata(false);
    return pk;
};

describe('network', () => {
    describe('packet', () => {
        describe('AddActorPacket', () => {
            it('encodes the 2193 layout, using the runtime id as the Target Actor ID when none is set', () => {
                const pk = buildPacket();
                pk.encode();

                expect(pk.getBuffer()).toEqual(
                    expectedBytes({
                        targetActorId: [0x04], // 2 zigzags to 4
                        actorData: [0x00], // no entries
                        actorLinks: [0x00] // none
                    })
                );
            });

            it('writes an explicit unique id, one metadata entry and each link in the six-field layout', () => {
                const pk = buildPacket();
                pk.uniqueEntityId = -1n;
                pk.metadata.setPropertyValue(MetadataFlag.COLOR, FlagType.BYTE, 7);
                pk.links = [
                    {
                        targetA: 2n,
                        targetB: 9n,
                        type: ActorLinkType.Riding,
                        immediate: true,
                        passengerInitiated: false,
                        vehicleAngularVelocity: 0.5
                    }
                ];
                pk.encode();

                expect(pk.getBuffer()).toEqual(
                    expectedBytes({
                        targetActorId: [0x01], // -1 zigzags to 1
                        // One entry: ID 3 (COLOR), one-of selector 0 (Byte), Type 0 again, Value 7.
                        actorData: [0x01, 0x03, 0x00, 0x00, 0x07],
                        // One link: Target A 2 (zigzag 4), Target B 9 (zigzag 18), Type Riding,
                        // Immediate, not Passenger Initiated, Vehicle Angular Velocity 0.5.
                        actorLinks: [0x01, 0x04, 0x12, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x3f]
                    })
                );
            });

            it('round-trips ids, movement, attributes, metadata and links', () => {
                const pk = buildPacket();
                pk.uniqueEntityId = -1n;
                pk.metadata.setPropertyValue(MetadataFlag.COLOR, FlagType.BYTE, 7);
                pk.syncedProperties.intProps.push({ index: 1, value: -4 });
                pk.links = [
                    {
                        targetA: 2n,
                        targetB: 9n,
                        type: ActorLinkType.Riding,
                        immediate: true,
                        passengerInitiated: false,
                        vehicleAngularVelocity: 0.5
                    }
                ];
                pk.encode();

                const decoded = new AddActorPacket(pk.getBuffer());
                decoded.decode();

                expect(decoded.uniqueEntityId).toBe(-1n);
                expect(decoded.runtimeEntityId).toBe(2n);
                expect(decoded.type).toBe('minecraft:pig');
                expect(decoded.position).toEqual(new Vector3(1, 2, 3));
                expect(decoded.motion).toEqual(new Vector3(0, 0, 0));
                expect(decoded.pitch).toBe(10);
                expect(decoded.yaw).toBe(20);
                expect(decoded.headYaw).toBe(30);

                expect(decoded.attributes).toHaveLength(1);
                expect(decoded.attributes[0]!.getName()).toBe(AttributeIds.Health);
                expect(decoded.attributes[0]!.getValue()).toBe(10);

                expect(decoded.metadata.getData()).toEqual(pk.metadata.getData());
                expect(decoded.syncedProperties.intProps).toEqual([{ index: 1, value: -4 }]);
                expect(decoded.links).toEqual(pk.links);
                expect(decoded.feof()).toBe(true);
            });
        });
    });
});
