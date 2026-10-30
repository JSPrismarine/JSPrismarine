import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Attribute, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
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

    it('reads past a modifier whose Operation and Operand are plain int32, not varints', () => {
        // AttributeModifier in docs order. Neither int32 carries the Compression option, so an
        // operation of 1 is four bytes, not one; a varint reader would land three bytes early.
        const input = new BinaryStream();
        input.writeUnsignedVarInt(HEADER);
        input.writeUnsignedVarInt(300); // Target Runtime ID, two bytes as a varuint.
        input.writeUnsignedVarInt(1);
        input.writeFloatLE(0);
        input.writeFloatLE(20);
        input.writeFloatLE(7);
        input.writeFloatLE(0);
        input.writeFloatLE(20);
        input.writeFloatLE(20);
        const name = Buffer.from('minecraft:health', 'utf-8');
        input.writeUnsignedVarInt(name.byteLength);
        input.write(name);
        input.writeUnsignedVarInt(1); // Modifiers count.
        input.writeUnsignedVarInt(2); // Id.
        input.write(Buffer.from('id'));
        input.writeUnsignedVarInt(4); // Name.
        input.write(Buffer.from('name'));
        input.writeFloatLE(2.5); // Amount.
        input.write(Buffer.from([0x01, 0x00, 0x00, 0x00])); // Operation, int32 LE.
        input.write(Buffer.from([0x02, 0x00, 0x00, 0x00])); // Operand, int32 LE.
        input.writeBoolean(true); // Is Serializable?
        input.writeUnsignedVarLong(1_000_000n); // Tick, three bytes as a varuint64.

        const packet = new UpdateAttributesPacket(input.getBuffer());
        packet.decode();

        expect(packet.runtimeEntityId).toBe(300n);
        expect(packet.attributes.map((attribute) => attribute.getName())).toEqual(['minecraft:health']);
        expect(packet.attributes[0]?.getValue()).toBe(7);
        expect(packet.tick).toBe(1_000_000n);
        expect(packet.feof()).toBe(true);
    });

    it('sends the player defaults as vanilla names with sane bounds, read back by an independent reader', () => {
        // The reader below walks the bytes by offset and never calls Attribute.networkDeserialize,
        // so a writer and reader that agree on the wrong layout cannot pass it together. A client
        // that gets a NaN, a current value outside its bounds, or an attribute name it does not
        // know drops the whole list, which is why each entry is checked and not only the shape.
        const packet = new UpdateAttributesPacket();
        packet.runtimeEntityId = 1n;
        packet.attributes = Attributes.getPlayerDefaults();
        packet.tick = 0n;
        packet.encode();
        const buffer = packet.getBuffer();

        let offset = 0;
        const varuint = (): bigint => {
            let result = 0n;
            let shift = 0n;
            for (;;) {
                const byte = buffer[offset++];
                if (byte === undefined) throw new Error('ran off the end of the packet');
                result |= BigInt(byte & 0x7f) << shift;
                if ((byte & 0x80) === 0) return result;
                shift += 7n;
            }
        };
        const float = (): number => {
            const value = buffer.readFloatLE(offset);
            offset += 4;
            return value;
        };
        const string = (): string => {
            const length = Number(varuint());
            const value = buffer.subarray(offset, offset + length).toString('utf-8');
            offset += length;
            return value;
        };

        expect(varuint()).toBe(BigInt(HEADER));
        expect(varuint()).toBe(1n);
        const count = Number(varuint());
        expect(count).toBe(Attributes.getPlayerDefaults().length);

        const names: string[] = [];
        for (let index = 0; index < count; index++) {
            const [min, max, current, defaultMin, defaultMax, defaultValue] = [
                float(),
                float(),
                float(),
                float(),
                float(),
                float()
            ];
            const name = string();
            names.push(name);

            for (const value of [min, max, current, defaultMin, defaultMax, defaultValue]) {
                expect(Number.isFinite(value), `${name} carries a non-finite float`).toBe(true);
            }
            expect(min <= current && current <= max, `${name} current ${current} outside [${min}, ${max}]`).toBe(true);
            expect(defaultMin <= defaultValue && defaultValue <= defaultMax, `${name} default out of bounds`).toBe(
                true
            );
            expect(name.startsWith('minecraft:'), `${name} is not a vanilla attribute name`).toBe(true);
            expect(varuint(), `${name} should carry no modifiers`).toBe(0n);
        }

        expect(names).toContain('minecraft:health');
        expect(names).toContain('minecraft:player.hunger');
        expect(new Set(names).size).toBe(names.length);

        expect(varuint()).toBe(0n); // Tick.
        expect(offset).toBe(buffer.byteLength);
    });
});
