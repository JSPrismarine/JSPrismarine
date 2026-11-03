import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from './NetworkBinaryStream';

function encodeUnsignedVarInt(value: number): Buffer {
    const bytes: number[] = [];
    let remaining = value >>> 0;
    do {
        let byte = remaining & 0x7f;
        remaining >>>= 7;
        if (remaining !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (remaining !== 0);
    return Buffer.from(bytes);
}

describe('NetworkBinaryStream strings', () => {
    it.each(['', 'Bedrock', 'é雪😀', 'é'.repeat(130)])('writes UTF-8 with a byte-length prefix: %s', (value) => {
        const stream = new NetworkBinaryStream();
        const utf8 = Buffer.from(value, 'utf8');
        stream.writeString(value);

        expect(stream.getWriteBuffer()).toStrictEqual(Buffer.concat([encodeUnsignedVarInt(utf8.byteLength), utf8]));

        const reader = new NetworkBinaryStream(stream.getWriteBuffer());
        expect(reader.readString()).toBe(value);
        expect(reader.getReadIndex()).toBe(stream.getWriteBuffer().byteLength);
    });
});
