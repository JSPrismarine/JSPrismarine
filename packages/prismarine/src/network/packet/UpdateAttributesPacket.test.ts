import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Attribute } from '../../entity/Attribute';
import UpdateAttributesPacket from './UpdateAttributesPacket';

/**
 * The bytes are written by hand in the order protocol 2193 documents for `UpdateAttributesPacket`:
 * Target Runtime ID, Attribute List (count, then AttributeData entries), Tick. A round trip
 * through the class would pass with the fields in any order; these tests would not.
 */

const HEADER = 0x1d;

/** One AttributeData entry with an empty Modifiers list. */
const writeAttribute = (
    out: BinaryStream,
    { name, min, max, value, def }: { name: string; min: number; max: number; value: number; def: number }
): void => {
    out.writeFloatLE(min); // Min Value.
    out.writeFloatLE(max); // Max Value.
    out.writeFloatLE(value); // Current Value.
    out.writeFloatLE(min); // Default Min Value, sent as the live minimum.
    out.writeFloatLE(max); // Default Max Value, sent as the live maximum.
    out.writeFloatLE(def); // Default Value.
    const bytes = Buffer.from(name, 'utf-8');
    out.writeUnsignedVarInt(bytes.byteLength); // Name.
    out.write(bytes);
    out.writeUnsignedVarInt(0); // Modifiers, none.
};

const health = { name: 'minecraft:health', min: 0, max: 20, value: 7, def: 20 };
const movement = { name: 'minecraft:movement', min: 0, max: 1, value: 0.1, def: 0.1 };

describe('UpdateAttributesPacket', () => {
    it('encodes runtime id, one attribute with no modifiers, then the tick', () => {
        const packet = new UpdateAttributesPacket();
        packet.runtimeEntityId = 42n;
        packet.attributes = [new Attribute(health)];
        packet.tick = 300n;
        packet.encode();

        const expected = new BinaryStream();
        expected.writeUnsignedVarInt(HEADER);
        expected.writeUnsignedVarInt(42); // Target Runtime ID.
        expected.writeUnsignedVarInt(1); // Attribute List count.
        expected.writeFloatLE(0); // Min Value.
        expected.writeFloatLE(20); // Max Value.
        expected.writeFloatLE(7); // Current Value.
        expected.writeFloatLE(0); // Default Min Value.
        expected.writeFloatLE(20); // Default Max Value.
        expected.writeFloatLE(20); // Default Value.
        const name = Buffer.from('minecraft:health', 'utf-8');
        expected.writeUnsignedVarInt(name.byteLength); // Name.
        expected.write(name);
        expected.writeUnsignedVarInt(0); // Modifiers count.
        expected.writeUnsignedVarInt(300); // Tick.

        expect(packet.getBuffer()).toEqual(expected.getBuffer());
    });

    it('writes the attribute count once and the tick after the last attribute', () => {
        const packet = new UpdateAttributesPacket();
        packet.runtimeEntityId = 42n;
        packet.attributes = [new Attribute(health), new Attribute(movement)];
        packet.tick = 300n;
        packet.encode();
        const buffer = packet.getBuffer();

        const expected = new BinaryStream();
        expected.writeUnsignedVarInt(HEADER);
        expected.writeUnsignedVarInt(42);
        expected.writeUnsignedVarInt(2);
        writeAttribute(expected, health);
        writeAttribute(expected, movement);
        const tickOffset = expected.getBuffer().length;
        expected.writeUnsignedVarInt(300);

        // Header and runtime id are one byte each, so the count sits at index 2.
        expect(buffer[2]).toBe(2);
        // 300 is 0xac 0x02 as a varuint, and nothing follows it.
        expect([...buffer.subarray(tickOffset)]).toEqual([0xac, 0x02]);
        expect(buffer).toEqual(expected.getBuffer());
    });

    it('decodes a hand-built packet and consumes every byte', () => {
        const input = new BinaryStream();
        input.writeUnsignedVarInt(HEADER);
        input.writeUnsignedVarInt(7);
        input.writeUnsignedVarInt(1);
        writeAttribute(input, health);
        input.writeUnsignedVarInt(12345);

        const packet = new UpdateAttributesPacket(input.getBuffer());
        packet.decode();

        expect(packet.runtimeEntityId).toBe(7n);
        expect(packet.attributes).toHaveLength(1);
        const [attribute] = packet.attributes;
        expect(attribute?.getName()).toBe('minecraft:health');
        expect(attribute?.getMin()).toBe(0);
        expect(attribute?.getMax()).toBe(20);
        expect(attribute?.getValue()).toBe(7);
        expect(attribute?.getDefault()).toBe(20);
        expect(packet.tick).toBe(12345n);
        expect(packet.feof()).toBe(true);
    });
});
