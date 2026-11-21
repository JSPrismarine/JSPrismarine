import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { javaString, long, textComponent, unsignedShort, uuid, varInt } from './javaTypes';

const bytesOf = <T>(type: { write(stream: BinaryStream, value: T): void }, value: T): number[] => {
    const stream = new BinaryStream();
    type.write(stream, value);
    return [...stream.getBuffer()];
};

describe('Java wire types', () => {
    // The community protocol page's VarInt examples.
    it.each([
        [0, [0x00]],
        [1, [0x01]],
        [127, [0x7f]],
        [128, [0x80, 0x01]],
        [255, [0xff, 0x01]],
        [25_565, [0xdd, 0xc7, 0x01]],
        [2_097_151, [0xff, 0xff, 0x7f]],
        [2_147_483_647, [0xff, 0xff, 0xff, 0xff, 0x07]],
        [-1, [0xff, 0xff, 0xff, 0xff, 0x0f]],
        [-2_147_483_648, [0x80, 0x80, 0x80, 0x80, 0x08]]
    ])('writes the VarInt %i as the bytes the protocol page lists, and reads it back', (value, bytes) => {
        expect(bytesOf(varInt, value)).toEqual(bytes);
        expect(varInt.read(new BinaryStream(Buffer.from(bytes)))).toBe(value);
    });

    it('writes an unsigned short and a long big-endian', () => {
        expect(bytesOf(unsignedShort, 25_565)).toEqual([0x63, 0xdd]);
        expect(bytesOf(long, -2n)).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe]);
    });

    it('refuses a string longer than its field allows', () => {
        const stream = new BinaryStream();
        javaString(10).write(stream, 'a'.repeat(11));

        expect(() => javaString(10).read(new BinaryStream(stream.getBuffer()))).toThrow(
            'A string of 11 characters is longer than the 10 its field allows'
        );
    });

    it('writes a UUID as sixteen bytes, most significant first', () => {
        const id = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

        expect(bytesOf(uuid, id)).toEqual([...Buffer.from('0f1e2d3c4b5a69788796a5b4c3d2e1f0', 'hex')]);
        expect(uuid.read(new BinaryStream(Buffer.from(bytesOf(uuid, id))))).toBe(id);
    });

    it('writes plain text as an unnamed NBT String tag', () => {
        expect(bytesOf(textComponent, 'Hi')).toEqual([0x08, 0x00, 0x02, 0x48, 0x69]);
        expect(() => textComponent.read(new BinaryStream(Buffer.from([0x03, 0, 0, 0, 1])))).toThrow(
            'A text component with NBT tag 3 is not plain text'
        );
    });

    it('writes a translation as a compound, its arguments as text compounds, and reads it back', () => {
        const text = { translate: 'chat.type.text', with: ['Steve', 'hello'] };
        const bytes = bytesOf(textComponent, text);

        expect(bytes.slice(0, 4)).toEqual([0x0a, 0x08, 0x00, 0x09]);
        expect(textComponent.read(new BinaryStream(Buffer.from(bytes)))).toEqual(text);
    });
});
