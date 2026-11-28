/**
 * The two image codecs a conversion needs: reading the TGA textures Bedrock packs ship, and writing
 * PNG, the one texture format a Java client reads.
 */
import { crc32, deflateSync } from 'node:zlib';

/** An image as eight-bit RGBA rows, top row first. */
export interface RgbaImage {
    readonly width: number;
    readonly height: number;
    /** `width * height * 4` bytes: red, green, blue and alpha for each pixel. */
    readonly pixels: Uint8Array;
}

/** Why a TGA did not decode, for the conversion report. */
export type TgaProblem = { readonly ok: false; readonly reason: string };

/** The TGA image types Bedrock packs use: color-mapped, true color, and either run-length encoded. */
const COLOR_MAPPED = 1;
const TRUE_COLOR = 2;
const GRAYSCALE = 3;
const RLE = 8;

/**
 * Reads a TGA file: color-mapped, true color or grayscale, plain or run-length encoded, at 8, 16,
 * 24 or 32 bits a pixel, with its origin at either the bottom or the top left. Those cover every
 * TGA in Mojang's vanilla resource pack.
 *
 * @returns The image, or why it did not read.
 */
export const decodeTga = (bytes: Uint8Array): ({ readonly ok: true } & RgbaImage) | TgaProblem => {
    const fail = (reason: string): TgaProblem => ({ ok: false, reason });
    if (bytes.byteLength < 18) return fail('it is shorter than a TGA header');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const idLength = bytes[0]!;
    const hasColorMap = bytes[1] === 1;
    const imageType = bytes[2]!;
    const mapFirst = view.getUint16(3, true);
    const mapLength = view.getUint16(5, true);
    const mapEntryBits = bytes[7]!;
    const width = view.getUint16(12, true);
    const height = view.getUint16(14, true);
    const depth = bytes[16]!;
    const descriptor = bytes[17]!;
    const kind = imageType & ~RLE;
    const rle = (imageType & RLE) !== 0;
    if (![COLOR_MAPPED, TRUE_COLOR, GRAYSCALE].includes(kind))
        return fail(`its image type ${imageType} is not one this reads`);
    if (width === 0 || height === 0) return fail('it has no pixels');
    if (descriptor & 0x10) return fail('it is stored right to left');

    let offset = 18 + idLength;
    let palette: Uint8Array | undefined;
    if (hasColorMap) {
        const entryBytes = Math.ceil(mapEntryBits / 8);
        const end = offset + mapLength * entryBytes;
        if (end > bytes.byteLength) return fail('its color map runs past the end of the file');
        palette = new Uint8Array(mapLength * 4);
        for (let i = 0; i < mapLength; i++) readColor(bytes, offset + i * entryBytes, mapEntryBits, palette, i * 4);
        offset = end;
    }
    if (kind === COLOR_MAPPED && palette === undefined) return fail('it is color-mapped and has no color map');

    const pixelBytes = Math.ceil(depth / 8);
    if (pixelBytes === 0 || pixelBytes > 4) return fail(`its pixel depth ${depth} is not one this reads`);
    const count = width * height;
    const stored = new Uint8Array(count * 4);
    const put = (pixel: number, at: number): boolean => {
        if (at + pixelBytes > bytes.byteLength) return false;
        if (kind === COLOR_MAPPED) {
            const index = readIndex(bytes, at, pixelBytes) - mapFirst;
            if (index < 0 || index >= mapLength) return false;
            stored.set(palette!.subarray(index * 4, index * 4 + 4), pixel * 4);
        } else if (kind === GRAYSCALE) {
            const value = bytes[at]!;
            stored.set([value, value, value, pixelBytes > 1 ? bytes[at + 1]! : 0xff], pixel * 4);
        } else {
            readColor(bytes, at, depth, stored, pixel * 4);
        }
        return true;
    };

    if (!rle) {
        for (let pixel = 0; pixel < count; pixel++) {
            if (!put(pixel, offset + pixel * pixelBytes)) return fail('its pixels run past the end of the file');
        }
    } else {
        let pixel = 0;
        while (pixel < count) {
            if (offset >= bytes.byteLength) return fail('its pixels run past the end of the file');
            const header = bytes[offset++]!;
            const run = (header & 0x7f) + 1;
            if (pixel + run > count) return fail('a run passes the last pixel');
            if (header & 0x80) {
                if (!put(pixel, offset)) return fail('its pixels run past the end of the file');
                for (let i = 1; i < run; i++) stored.copyWithin((pixel + i) * 4, pixel * 4, pixel * 4 + 4);
                offset += pixelBytes;
            } else {
                for (let i = 0; i < run; i++, offset += pixelBytes) {
                    if (!put(pixel + i, offset)) return fail('its pixels run past the end of the file');
                }
            }
            pixel += run;
        }
    }

    // Rows are stored bottom first unless the descriptor says the origin is at the top.
    if (descriptor & 0x20) return { ok: true, width, height, pixels: stored };
    const pixels = new Uint8Array(count * 4);
    const row = width * 4;
    for (let y = 0; y < height; y++) pixels.set(stored.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    return { ok: true, width, height, pixels };
};

/** Reads a little-endian color-map index of one or two bytes. */
const readIndex = (bytes: Uint8Array, at: number, size: number): number =>
    size === 1 ? bytes[at]! : bytes[at]! | (bytes[at + 1]! << 8);

/** Writes one TGA color, stored as BGR or BGRA, or as 15 or 16 bits of ARRRRRGG GGGBBBBB, as RGBA. */
const readColor = (bytes: Uint8Array, at: number, bits: number, out: Uint8Array, to: number): void => {
    if (bits === 15 || bits === 16) {
        const value = bytes[at]! | (bytes[at + 1]! << 8);
        const scale = (five: number) => (five << 3) | (five >> 2);
        out[to] = scale((value >> 10) & 0x1f);
        out[to + 1] = scale((value >> 5) & 0x1f);
        out[to + 2] = scale(value & 0x1f);
        out[to + 3] = bits === 16 && (value & 0x8000) === 0 ? 0 : 0xff;
        return;
    }
    out[to] = bytes[at + 2]!;
    out[to + 1] = bytes[at + 1]!;
    out[to + 2] = bytes[at]!;
    out[to + 3] = bits === 32 ? bytes[at + 3]! : 0xff;
};

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/** One PNG chunk: its length, type, data and the CRC of type and data. */
const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
    const chunk = new Uint8Array(12 + data.byteLength);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.byteLength);
    for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
    chunk.set(data, 8);
    view.setUint32(8 + data.byteLength, crc32(chunk.subarray(4, 8 + data.byteLength)));
    return chunk;
};

/**
 * Writes an image as an eight-bit RGBA PNG, every row unfiltered. The same image always gives the
 * same bytes with the same zlib build, which keeps a converted pack's hash stable.
 */
export const encodePng = ({ width, height, pixels }: RgbaImage): Uint8Array => {
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header.set([8, 6, 0, 0, 0], 8);
    const row = width * 4;
    const raw = new Uint8Array((row + 1) * height);
    for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
    const parts = [
        PNG_SIGNATURE,
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(raw)),
        pngChunk('IEND', new Uint8Array())
    ];
    const png = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
        png.set(part, offset);
        offset += part.byteLength;
    }
    return png;
};

/** Whether bytes start with the PNG signature. */
export const isPng = (bytes: Uint8Array): boolean =>
    bytes.byteLength >= PNG_SIGNATURE.byteLength && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
