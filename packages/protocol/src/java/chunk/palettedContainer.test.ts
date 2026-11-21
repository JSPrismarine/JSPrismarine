import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { biomesKind, blockStatesKind, readPalettedContainer, writePalettedContainer } from './palettedContainer';

const blocks = blockStatesKind(35_723);
const biomes = biomesKind(67);

/** Writes `values`, and returns the bits byte and what reading the bytes back gives. */
const roundTrip = (values: number[], kind = blocks) => {
    const stream = new BinaryStream();
    writePalettedContainer(stream, values, kind);
    const bytes = stream.getBuffer();
    return { bits: bytes[0], read: readPalettedContainer(new BinaryStream(bytes), kind), byteLength: bytes.byteLength };
};

describe('paletted containers', () => {
    it('writes a section of one block as zero bits and the one id', () => {
        expect(roundTrip(new Array(4096).fill(0))).toEqual({ bits: 0, read: new Array(4096).fill(0), byteLength: 2 });
    });

    it('uses at least four bits for a few block states, and reads every one back', () => {
        const values = Array.from({ length: 4096 }, (_, i) => [1, 9, 10][i % 3]!);
        const { bits, read } = roundTrip(values);

        expect(bits).toBe(4);
        expect(read).toEqual(values);
    });

    it("falls back to the registry's own ids past eight bits, at the bits the registry needs", () => {
        const values = Array.from({ length: 4096 }, (_, i) => (i * 7) % 35_723);
        const { bits, read } = roundTrip(values);

        expect(bits).toBe(16);
        expect(read).toEqual(values);
    });

    it("packs biomes at one to three bits, then at the biome registry's seven", () => {
        expect(
            roundTrip(
                Array.from({ length: 64 }, (_, i) => i % 2),
                biomes
            ).bits
        ).toBe(1);
        const many = Array.from({ length: 64 }, (_, i) => i % 9);
        expect(roundTrip(many, biomes)).toMatchObject({ bits: 7, read: many });
    });
});
