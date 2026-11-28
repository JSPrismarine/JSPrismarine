import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { decodeTga, encodePng, isPng } from './image';
import type { RgbaImage } from './image';

/** A TGA header: no id, the given image type and color map, the size, depth and descriptor. */
const header = (
    type: number,
    width: number,
    height: number,
    depth: number,
    descriptor: number,
    map?: [number, number]
) => {
    const bytes = new Uint8Array(18);
    const view = new DataView(bytes.buffer);
    bytes[1] = map === undefined ? 0 : 1;
    bytes[2] = type;
    if (map !== undefined) {
        view.setUint16(5, map[0], true);
        bytes[7] = map[1];
    }
    view.setUint16(12, width, true);
    view.setUint16(14, height, true);
    bytes[16] = depth;
    bytes[17] = descriptor;
    return bytes;
};

const concat = (...parts: (Uint8Array | number[])[]): Uint8Array => {
    const flat = parts.flatMap((part) => [...part]);
    return Uint8Array.from(flat);
};

/** The pixels of a decoded TGA, failing the test when it does not decode. */
const pixelsOf = (bytes: Uint8Array): number[] => {
    const image = decodeTga(bytes);
    if (!image.ok) throw new TypeError(image.reason);
    return [...image.pixels];
};

describe('decodeTga', () => {
    // Red top left, green top right, blue bottom left, white half transparent bottom right.
    const expected = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128];

    it('reads 32-bit true color stored bottom row first, as Bedrock exports it', () => {
        const bottom = [255, 0, 0, 255, 255, 255, 255, 128];
        const top = [0, 0, 255, 255, 0, 255, 0, 255];
        expect(pixelsOf(concat(header(2, 2, 2, 32, 8), bottom, top))).toEqual(expected);
    });

    it('reads 32-bit true color stored top row first', () => {
        const top = [0, 0, 255, 255, 0, 255, 0, 255];
        const bottom = [255, 0, 0, 255, 255, 255, 255, 128];
        expect(pixelsOf(concat(header(2, 2, 2, 32, 8 | 0x20), top, bottom))).toEqual(expected);
    });

    it('reads run-length encoded pixels, both runs and raw packets', () => {
        // A run of three opaque red, then one raw half-transparent white, stored top first.
        const runs = [0x82, 0, 0, 255, 255, 0x00, 255, 255, 255, 128];
        expect(pixelsOf(concat(header(10, 2, 2, 32, 8 | 0x20), runs))).toEqual([
            ...[255, 0, 0, 255],
            ...[255, 0, 0, 255],
            ...[255, 0, 0, 255],
            ...[255, 255, 255, 128]
        ]);
    });

    it('reads 24-bit true color as opaque, and color-mapped pixels through the map', () => {
        expect(pixelsOf(concat(header(2, 1, 1, 24, 0x20), [10, 20, 30]))).toEqual([30, 20, 10, 255]);
        const map = [0, 0, 255, 0, 255, 0];
        expect(pixelsOf(concat(header(1, 2, 1, 8, 0x20, [2, 24]), map, [1, 0]))).toEqual([
            ...[0, 255, 0, 255],
            ...[255, 0, 0, 255]
        ]);
    });

    it('says why a file does not read rather than throwing', () => {
        expect(decodeTga(new Uint8Array(4))).toEqual({ ok: false, reason: 'it is shorter than a TGA header' });
        expect(decodeTga(concat(header(2, 2, 2, 32, 8), [1, 2, 3]))).toMatchObject({ ok: false });
        expect(decodeTga(header(9, 1, 1, 8, 0))).toMatchObject({ ok: false });
        expect(decodeTga(concat(header(10, 1, 1, 32, 0), [0x85, 1, 2, 3, 4]))).toEqual({
            ok: false,
            reason: 'a run passes the last pixel'
        });
    });
});

describe('encodePng', () => {
    const image: RgbaImage = { width: 2, height: 1, pixels: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8) };

    it('writes an RGBA PNG whose rows carry the pixels unfiltered', () => {
        const png = encodePng(image);
        const view = new DataView(png.buffer, png.byteOffset);

        expect(isPng(png)).toBe(true);
        expect([view.getUint32(16), view.getUint32(20), png[24], png[25]]).toEqual([2, 1, 8, 6]);
        const idatLength = view.getUint32(33);
        expect(new TextDecoder().decode(png.subarray(37, 41))).toBe('IDAT');
        expect([...inflateSync(png.subarray(41, 41 + idatLength))]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('writes the same bytes for the same image', () => {
        expect(encodePng(image)).toEqual(encodePng({ ...image, pixels: Uint8Array.from(image.pixels) }));
    });
});
