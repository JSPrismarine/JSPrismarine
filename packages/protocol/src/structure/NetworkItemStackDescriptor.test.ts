import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkItemStackDescriptor from './NetworkItemStackDescriptor';

const encode = (descriptor: NetworkItemStackDescriptor): Buffer => {
    const stream = new NetworkBinaryStream();
    descriptor.serialize(stream);
    return stream.getBuffer();
};

// One group per docs field, in wire order.
const plain = Buffer.from([
    0x05,
    0x00, // Id: int16 LE 5
    0x40,
    0x00, // Stack size: uint16 LE 64
    0x03, // Aux value: varuint32 3
    0x00, // Net Id Variant: not present
    0xd2,
    0x09, // Block Runtime Id: varuint32 1234
    0x00 // User Data Buffer: length 0
]);

const withNetId = Buffer.from([
    0x05,
    0x00, // Id
    0x40,
    0x00, // Stack size
    0x03, // Aux value
    0x01, // Net Id Variant: present
    0x54, // Net Id Variant: varint32 ZigZag 42
    0xd2,
    0x09, // Block Runtime Id
    0x00 // User Data Buffer
]);

describe('NetworkItemStackDescriptor', () => {
    it('serializes a stack without a net id in docs order', () => {
        expect(encode(new NetworkItemStackDescriptor(5, 64, 3, false, 1234))).toEqual(plain);
    });

    it('writes the net id variant after its presence byte', () => {
        expect(encode(new NetworkItemStackDescriptor(5, 64, 3, true, 1234, { netIdVariant: 42 }))).toEqual(withNetId);
    });

    it('writes a supplied user data blob after its length', () => {
        const blob = Buffer.from([0xaa, 0xbb, 0xcc]);
        const bytes = encode(new NetworkItemStackDescriptor(5, 64, 3, false, 1234, { userDataBuffer: blob }));

        expect(bytes).toEqual(Buffer.concat([plain.subarray(0, -1), Buffer.from([0x03]), blob]));
    });

    it('writes an empty stack as zeroes after the id, dropping the blob', () => {
        const blob = Buffer.from([0xaa]);
        const bytes = encode(new NetworkItemStackDescriptor(0, 64, 3, false, 1234, { userDataBuffer: blob }));

        expect(bytes).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
    });

    it('deserializes a hand-built buffer and consumes it all', () => {
        const stream = new NetworkBinaryStream(withNetId);
        const descriptor = NetworkItemStackDescriptor.deserialize(stream);

        expect(descriptor.id).toBe(5);
        expect(descriptor.stackSize).toBe(64);
        expect(descriptor.auxValue).toBe(3);
        expect(descriptor.includeNetid).toBe(true);
        expect(descriptor.netIdVariant).toBe(42);
        expect(descriptor.blockRuntimeId).toBe(1234);
        expect(descriptor.userDataBuffer).toEqual(Buffer.alloc(0));
        expect(stream.feof()).toBe(true);
    });
});
