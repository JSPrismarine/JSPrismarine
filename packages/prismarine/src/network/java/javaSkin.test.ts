import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { decodePng, fetchJavaSkin, skinSheetOf, skinTextureOf, texturesPropertyOf } from './javaSkin';

const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.byteLength);
    // Nothing here checks the CRC, so it is left zero.
    return Buffer.concat([length, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
};

/**
 * A PNG of `rows`, each already packed for its color type, behind the given filter bytes.
 * @param extra - Chunks between the header and the data, such as a palette.
 */
const png = (
    width: number,
    height: number,
    depth: number,
    colorType: number,
    rows: readonly Buffer[],
    filters: readonly number[] = rows.map(() => 0),
    extra: readonly Buffer[] = []
): Buffer => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = depth;
    header[9] = colorType;
    const data = Buffer.concat(rows.map((row, i) => Buffer.concat([Buffer.from([filters[i]!]), row])));
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        ...extra,
        chunk('IDAT', deflateSync(data)),
        chunk('IEND', Buffer.alloc(0))
    ]);
};

/** A `textures` property value naming `url`, with the slim model when asked. */
const texturesValue = (url: string, slim = false): string =>
    Buffer.from(
        JSON.stringify({ textures: { SKIN: { url, ...(slim ? { metadata: { model: 'slim' } } : {}) } } })
    ).toString('base64');

const SKIN_URL = 'http://textures.minecraft.net/texture/abc123';

describe('skinTextureOf', () => {
    it("reads the skin's address over HTTPS, and its arms", () => {
        expect(skinTextureOf(texturesValue(SKIN_URL))).toStrictEqual({
            url: 'https://textures.minecraft.net/texture/abc123',
            slim: false
        });
        expect(skinTextureOf(texturesValue(SKIN_URL, true))?.slim).toBe(true);
    });

    it("names no skin off Mojang's texture server, or for a property that is not one", () => {
        expect(skinTextureOf(texturesValue('https://example.com/texture/abc123'))).toBeUndefined();
        expect(skinTextureOf(Buffer.from('{"textures":{}}').toString('base64'))).toBeUndefined();
        expect(skinTextureOf('not base64 json')).toBeUndefined();
    });
});

describe('texturesPropertyOf', () => {
    it("takes the profile's signed textures property, and nothing for a profile without one", () => {
        const property = { name: 'textures', value: 'dmFsdWU=', signature: 'c2ln' };

        expect(texturesPropertyOf({ id: 'a', name: 'Notch', properties: [property] })).toStrictEqual({
            value: 'dmFsdWU=',
            signature: 'c2ln'
        });
        expect(texturesPropertyOf({ id: 'a', name: 'Notch', properties: [] })).toBeUndefined();
    });
});

describe('decodePng', () => {
    it('reads RGBA rows through every filter', () => {
        const rows = [0, 1, 2, 3, 4].map((y) => Buffer.from([y, 10, 20, 255, y + 1, 30, 40, 128]));
        // The rows hold the raw pixels; each filter's bytes are what the encoder would write.
        const filtered = rows.map((row, y) => {
            const above = rows[y - 1] ?? Buffer.alloc(8);
            return Buffer.from(
                row.map((byte, x) => {
                    const left = x >= 4 ? row[x - 4]! : 0;
                    const up = above[x]!;
                    const corner = x >= 4 ? above[x - 4]! : 0;
                    const p = left + up - corner;
                    const paeth =
                        Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - corner)
                            ? left
                            : Math.abs(p - up) <= Math.abs(p - corner)
                              ? up
                              : corner;
                    const predicted = [0, left, up, (left + up) >> 1, paeth][y]!;
                    return (byte - predicted) & 0xff;
                })
            );
        });

        const image = decodePng(png(2, 5, 8, 6, filtered, [0, 1, 2, 3, 4]));

        expect(image?.rgba).toStrictEqual(Buffer.concat(rows));
    });

    it('reads a palette of four bits an index, with its transparency', () => {
        const palette = chunk('PLTE', Buffer.from([255, 0, 0, 0, 255, 0]));
        const transparency = chunk('tRNS', Buffer.from([0]));

        const image = decodePng(png(2, 1, 4, 3, [Buffer.from([0x01])], [0], [palette, transparency]));

        expect(image?.rgba).toStrictEqual(Buffer.from([255, 0, 0, 0, 0, 255, 0, 255]));
    });

    it('reads nothing that is not a PNG, or one with sixteen bits a channel', () => {
        expect(decodePng(Buffer.from('GIF89a'))).toBeUndefined();
        expect(decodePng(png(1, 1, 16, 6, [Buffer.alloc(8)]))).toBeUndefined();
    });
});

describe('skinSheetOf', () => {
    /** A 64-wide image whose every pixel is `rgba`. */
    const filled = (height: number, rgba: readonly number[]) => ({
        width: 64,
        height,
        rgba: Buffer.from(Array.from({ length: 64 * height }, () => rgba).flat())
    });
    const pixel = (sheet: Buffer, x: number, y: number) => [...sheet.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];

    it("moves an old skin's right leg and arm into the left ones, mirrored", () => {
        const image = filled(32, [0, 0, 0, 0]);
        // The right leg's outer face, at the left of its front strip.
        image.rgba.set([200, 100, 50, 255], (20 * 64 + 0) * 4);

        const sheet = skinSheetOf(image)!;

        expect(sheet).toHaveLength(64 * 64 * 4);
        // Copied 24 across and 32 down, and mirrored across its four columns.
        expect(pixel(sheet, 24 + 3, 52)).toStrictEqual([200, 100, 50, 255]);
    });

    it("clears an old skin's hat when it is wholly opaque, and makes every base layer opaque", () => {
        const sheet = skinSheetOf(filled(32, [1, 2, 3, 255]))!;
        const translucent = skinSheetOf(filled(64, [1, 2, 3, 10]))!;

        expect(pixel(sheet, 40, 8)[3]).toBe(0);
        expect(pixel(translucent, 8, 8)[3]).toBe(255);
        // A 64x64 skin keeps its hat as drawn.
        expect(pixel(translucent, 40, 8)[3]).toBe(10);
    });

    it('takes no image of another size', () => {
        expect(skinSheetOf({ width: 32, height: 32, rgba: Buffer.alloc(32 * 32 * 4) })).toBeUndefined();
    });
});

describe('fetchJavaSkin', () => {
    const skinPng = png(
        64,
        64,
        8,
        6,
        Array.from({ length: 64 }, () => Buffer.alloc(64 * 4, 0x7f))
    );

    it("fetches the skin the property names, as a Bedrock skin on the profile's arms", async () => {
        const asked: string[] = [];
        const skin = await fetchJavaSkin({ value: texturesValue(SKIN_URL, true), signature: 'c2ln' }, async (url) => {
            asked.push(url);
            return new Response(skinPng);
        });

        expect(asked).toStrictEqual(['https://textures.minecraft.net/texture/abc123']);
        expect(skin?.getImage().width).toBe(64);
        expect(skin?.getArmSize()).toBe('slim');
        expect(JSON.parse(skin!.getResourcePatch())).toStrictEqual({
            geometry: { default: 'geometry.humanoid.customSlim' }
        });
    });

    it('gives nothing when the texture server fails or answers with something else', async () => {
        const property = { value: texturesValue(SKIN_URL), signature: null };

        expect(await fetchJavaSkin(property, async () => new Response('', { status: 404 }))).toBeUndefined();
        expect(await fetchJavaSkin(property, async () => new Response('not a png'))).toBeUndefined();
        expect(
            await fetchJavaSkin(property, async () => {
                throw new Error('fetch failed');
            })
        ).toBeUndefined();
    });
});
