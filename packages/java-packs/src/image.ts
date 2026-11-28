/**
 * The two image codecs a conversion needs: reading the TGA textures Bedrock packs ship, and writing
 * PNG, the one texture format a Java client reads.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

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

/** Channels per pixel by PNG color type: grayscale, RGB, palette, grayscale with alpha, RGBA. */
const PNG_CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** The bit depths PNG allows for each color type. */
const PNG_DEPTHS: Readonly<Record<number, readonly number[]>> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16]
};

/** Adam7's seven passes: the first column and row of each, and its step across and down. */
const ADAM7: readonly (readonly [number, number, number, number])[] = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2]
];

/**
 * Undoes each row's filter against the row above, already unfiltered.
 * @returns The rows, or undefined for a filter type PNG does not define.
 */
const unfilter = (raw: Uint8Array, height: number, stride: number, step: number): Uint8Array | undefined => {
    const rows = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)]!;
        if (filter > 4) return undefined;
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const row = rows.subarray(y * stride, (y + 1) * stride);
        const above = y === 0 ? undefined : rows.subarray((y - 1) * stride, y * stride);
        for (let x = 0; x < stride; x++) {
            const left = x >= step ? row[x - step]! : 0;
            const up = above?.[x] ?? 0;
            const corner = above !== undefined && x >= step ? above[x - step]! : 0;
            const predicted =
                filter === 1
                    ? left
                    : filter === 2
                      ? up
                      : filter === 3
                        ? (left + up) >> 1
                        : filter === 4
                          ? paeth(left, up, corner)
                          : 0;
            row[x] = (line[x]! + predicted) & 0xff;
        }
    }
    return rows;
};

/** The Paeth predictor, PNG's fourth filter. */
const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
};

/**
 * Reads a PNG file of any color type and bit depth, plain or Adam7 interlaced, with its palette
 * and `tRNS` transparency. A 16-bit channel keeps its high byte.
 *
 * @returns The image, or why it did not read.
 */
export const decodePng = (bytes: Uint8Array): ({ readonly ok: true } & RgbaImage) | TgaProblem => {
    const fail = (reason: string): TgaProblem => ({ ok: false, reason });
    if (!isPng(bytes)) return fail('it is not a PNG file');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let width = 0;
    let height = 0;
    let depth = 0;
    let colorType = -1;
    let interlaced = false;
    let palette: Uint8Array | undefined;
    let transparency: Uint8Array | undefined;
    const data: Uint8Array[] = [];
    for (let at = 8; at + 8 <= bytes.byteLength;) {
        const length = view.getUint32(at);
        const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        const body = bytes.subarray(at + 8, at + 8 + length);
        if (body.byteLength !== length) return fail(`its ${type} chunk runs past the end of the file`);
        at += 12 + length;
        if (type === 'IHDR') {
            const header = new DataView(body.buffer, body.byteOffset, body.byteLength);
            width = header.getUint32(0);
            height = header.getUint32(4);
            depth = body[8]!;
            colorType = body[9]!;
            interlaced = body[12] === 1;
            if (body[12]! > 1) return fail(`its interlace method ${body[12]} is not one PNG defines`);
        } else if (type === 'PLTE') palette = body;
        else if (type === 'tRNS') transparency = body;
        else if (type === 'IDAT') data.push(body);
        else if (type === 'IEND') break;
    }
    const channels = PNG_CHANNELS[colorType];
    if (channels === undefined || !PNG_DEPTHS[colorType]!.includes(depth))
        return fail(`its color type ${colorType} at depth ${depth} is not one PNG allows`);
    if (width === 0 || height === 0) return fail('it has no pixels');
    if (colorType === 3 && palette === undefined) return fail('it uses a palette and has none');
    let raw: Uint8Array;
    try {
        raw = inflateSync(Buffer.concat(data));
    } catch {
        return fail('its image data does not inflate');
    }
    const bytesPerSample = depth === 16 ? 2 : 1;
    const sample = (row: Uint8Array, index: number): number => {
        if (depth >= 8) return row[index * bytesPerSample]!;
        const bit = index * depth;
        const value = (row[bit >> 3]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        // A low-depth gray value spans the whole range; a palette index stays an index.
        return colorType === 3 ? value : Math.round((value * 255) / ((1 << depth) - 1));
    };
    const fullSample = (row: Uint8Array, index: number): number =>
        depth === 16 ? (row[index * 2]! << 8) | row[index * 2 + 1]! : depth >= 8 ? row[index]! : sample(row, index);
    const transparentGray =
        colorType === 0 && transparency !== undefined && transparency.byteLength >= 2
            ? (transparency[0]! << 8) | transparency[1]!
            : undefined;
    const transparentRgb =
        colorType === 2 && transparency !== undefined && transparency.byteLength >= 6
            ? [0, 2, 4].map((i) => (transparency![i]! << 8) | transparency![i + 1]!)
            : undefined;

    const bitsPerPixel = channels * depth;
    const step = Math.max(1, bitsPerPixel / 8);
    const pixels = new Uint8Array(width * height * 4);
    const writePass = (
        rows: Uint8Array,
        stride: number,
        passWidth: number,
        passHeight: number,
        at: (x: number, y: number) => number
    ): void => {
        for (let y = 0; y < passHeight; y++) {
            const row = rows.subarray(y * stride, (y + 1) * stride);
            for (let x = 0; x < passWidth; x++) {
                const out = at(x, y);
                const first = x * channels;
                if (colorType === 3) {
                    const index = sample(row, first);
                    pixels[out] = palette![index * 3] ?? 0;
                    pixels[out + 1] = palette![index * 3 + 1] ?? 0;
                    pixels[out + 2] = palette![index * 3 + 2] ?? 0;
                    pixels[out + 3] = transparency?.[index] ?? 0xff;
                } else if (colorType === 0 || colorType === 4) {
                    const gray = sample(row, first);
                    pixels.set([gray, gray, gray], out);
                    pixels[out + 3] =
                        colorType === 4
                            ? sample(row, first + 1)
                            : transparentGray === fullSample(row, first)
                              ? 0
                              : 0xff;
                } else {
                    pixels.set([sample(row, first), sample(row, first + 1), sample(row, first + 2)], out);
                    const opaque =
                        transparentRgb === undefined ||
                        transparentRgb.some((value, channel) => value !== fullSample(row, first + channel));
                    pixels[out + 3] = colorType === 6 ? sample(row, first + 3) : opaque ? 0xff : 0;
                }
            }
        }
    };

    // A plain image is one pass over every pixel; an interlaced one is Adam7's seven passes.
    const passes = interlaced
        ? ADAM7
        : ([[0, 0, 1, 1]] satisfies readonly (readonly [number, number, number, number])[]);
    let offset = 0;
    for (const [x0, y0, dx, dy] of passes) {
        const passWidth = Math.ceil((width - x0) / dx);
        const passHeight = Math.ceil((height - y0) / dy);
        if (passWidth <= 0 || passHeight <= 0) continue;
        const stride = Math.ceil((passWidth * bitsPerPixel) / 8);
        if (raw.byteLength < offset + passHeight * (stride + 1)) return fail('its image data is shorter than its size');
        const rows = unfilter(raw.subarray(offset, offset + passHeight * (stride + 1)), passHeight, stride, step);
        if (rows === undefined) return fail('a row has a filter PNG does not define');
        offset += passHeight * (stride + 1);
        writePass(rows, stride, passWidth, passHeight, (x, y) => ((y0 + y * dy) * width + x0 + x * dx) * 4);
    }
    return { ok: true, width, height, pixels };
};
