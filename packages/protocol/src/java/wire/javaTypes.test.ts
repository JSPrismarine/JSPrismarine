import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import {
    blockPosition,
    javaString,
    long,
    lpVec3,
    sectionPosition,
    textComponent,
    unsignedShort,
    uuid,
    varInt,
    varLong
} from './javaTypes';

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

    // The community protocol page's VarLong examples.
    it.each([
        [2_147_483_648n, [0x80, 0x80, 0x80, 0x80, 0x08]],
        [-1n, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]]
    ])('writes the VarLong %i as the bytes the protocol page lists, and reads it back', (value, bytes) => {
        expect(bytesOf(varLong, value)).toEqual(bytes);
        expect(varLong.read(new BinaryStream(Buffer.from(bytes)))).toBe(value);
    });

    it('packs a block position as the protocol page does, negative coordinates included', () => {
        const position = { x: 18_357_644, y: 831, z: -20_882_616 };
        const below = { x: -5, y: -64, z: 7 };

        expect(Buffer.from(bytesOf(blockPosition, position)).toString('hex')).toBe('4607632c15b4833f');
        expect(blockPosition.read(new BinaryStream(Buffer.from('4607632c15b4833f', 'hex')))).toEqual(position);
        expect(blockPosition.read(new BinaryStream(Buffer.from(bytesOf(blockPosition, below))))).toEqual(below);
    });

    it('packs a section position x, z, y from the top, and reads a negative one back', () => {
        const section = { x: -1, y: -4, z: 2 };
        const bytes = Buffer.from(bytesOf(sectionPosition, section));

        expect(bytes.readBigInt64BE() >> 42n).toBe(-1n);
        expect((bytes.readBigUInt64BE() >> 20n) & 0x3fffffn).toBe(2n);
        expect(sectionPosition.read(new BinaryStream(bytes))).toEqual(section);
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

    describe('LpVec3', () => {
        it('writes the zero vector, and one too small to tell from it, as one zero byte', () => {
            expect(bytesOf(lpVec3, { x: 0, y: 0, z: 0 })).toEqual([0]);
            expect(bytesOf(lpVec3, { x: 1e-6, y: 0, z: 0 })).toEqual([0]);
            expect(lpVec3.read(new BinaryStream(Buffer.from([0])))).toEqual({ x: 0, y: 0, z: 0 });
        });

        it('packs a scale of one into the first byte, and each coordinate into 15 bits after it', () => {
            // Scale 1, then x = 1 as 32766, y = 0 as 16383 and z = -1 as 0, at bits 3, 18 and 33.
            const bytes = [241, 255, 0, 0, 255, 255];

            expect(bytesOf(lpVec3, { x: 1, y: 0, z: -1 })).toEqual(bytes);
            expect(lpVec3.read(new BinaryStream(Buffer.from(bytes)))).toEqual({ x: 1, y: 0, z: -1 });
        });

        it("carries a scale past the first byte's two bits in a VarInt after the vector", () => {
            // Scale 10: its low bits 2 with the continuation bit, then 10 >> 2 = 2 as a VarInt.
            const bytes = [246, 255, 127, 254, 255, 255, 2];

            expect(bytesOf(lpVec3, { x: 10, y: 0, z: 0 })).toEqual(bytes);
            expect(lpVec3.read(new BinaryStream(Buffer.from(bytes)))).toEqual({ x: 10, y: 0, z: 0 });
        });

        it('reads any vector back to within one step of its 15 bits', () => {
            const vector = { x: 0.3, y: -0.71, z: 0.05 };
            const stream = new BinaryStream();
            lpVec3.write(stream, vector);
            const read = lpVec3.read(new BinaryStream(stream.getBuffer()));

            for (const axis of ['x', 'y', 'z'] as const)
                expect(Math.abs(read[axis] - vector[axis])).toBeLessThan(2 / 32766);
        });
    });
});
