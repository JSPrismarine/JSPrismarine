/**
 * A Java Edition player's own skin, for Bedrock clients: the `textures` property Mojang's session
 * server signs names a PNG on Mojang's texture server, which is read into the RGBA sheet and the
 * geometry a Bedrock skin carries.
 */
import { inflateSync } from 'node:zlib';

import { DEFAULT_SKIN_RESOURCE_PATCH, SKIN_HEIGHT, SKIN_WIDTH } from '@jsprismarine/auth/DefaultSkin';
import Skin from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';

import { isRecord } from '../../utils/isRecord';
import type { JavaProfile } from './javaAuth';

/** The only host a skin is fetched from: Mojang's, where every signed `textures` property points. */
const TEXTURE_HOST = 'textures.minecraft.net';

/** How long the texture server may take before the player is shown the default skin. */
const FETCH_TIMEOUT_MS = 3_000;

/** The largest PNG read; a 64x64 skin is a few kilobytes. */
const MAX_PNG_BYTES = 256 * 1024;

/** Where a profile's skin is, and whether its arms are the slim ones. */
export interface JavaSkinTexture {
    readonly url: string;
    readonly slim: boolean;
}

/** A profile's `textures` property: what the Java client is sent, signature and all. */
export interface JavaTexturesProperty {
    readonly value: string;
    readonly signature: string | null;
}

/**
 * The profile's `textures` property, which Mojang's session server returned signed.
 * @param profile - The profile the login verified.
 * @returns The property, or undefined for a profile without one, such as an offline-mode player's.
 */
export const texturesPropertyOf = (profile: JavaProfile): JavaTexturesProperty | undefined => {
    const property = profile.properties.find(({ name }) => name === 'textures');
    return property === undefined ? undefined : { value: property.value, signature: property.signature };
};

/**
 * Reads the skin a `textures` property names: its base64 JSON's `textures.SKIN`, with
 * `metadata.model` set to `slim` for the slim arms.
 * @param value - The property's value.
 * @returns The skin, or undefined when the property names none, or one off Mojang's texture server.
 */
export const skinTextureOf = (value: string): JavaSkinTexture | undefined => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    } catch {
        return undefined;
    }
    const skin = isRecord(parsed) && isRecord(parsed.textures) ? parsed.textures.SKIN : undefined;
    if (!isRecord(skin) || typeof skin.url !== 'string') return undefined;
    let url: URL;
    try {
        url = new URL(skin.url);
    } catch {
        return undefined;
    }
    if (url.hostname !== TEXTURE_HOST) return undefined;
    // The property names the plain HTTP address; the server answers the same path over HTTPS.
    url.protocol = 'https:';
    return { url: url.toString(), slim: isRecord(skin.metadata) && skin.metadata.model === 'slim' };
};

/** A decoded image, row major from the top left, four bytes a pixel. */
export interface RgbaImage {
    readonly width: number;
    readonly height: number;
    readonly rgba: Buffer;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Channels per pixel by PNG color type: grayscale, RGB, palette, grayscale with alpha, RGBA. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

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
 * Decodes a PNG as skins use it: non-interlaced, eight bits a channel, or a palette of up to
 * eight bits an index. Anything else, which no skin editor writes, is not read.
 * @param png - The file.
 * @returns The image, or undefined when the file is not one this reads.
 */
export const decodePng = (png: Buffer): RgbaImage | undefined => {
    if (png.byteLength < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined;
    let width = 0;
    let height = 0;
    let depth = 0;
    let colorType = -1;
    let palette: Buffer | undefined;
    let transparency: Buffer | undefined;
    const data: Buffer[] = [];
    for (let at = 8; at + 8 <= png.byteLength;) {
        const length = png.readUInt32BE(at);
        const type = png.toString('latin1', at + 4, at + 8);
        const body = png.subarray(at + 8, at + 8 + length);
        if (body.byteLength !== length) return undefined;
        at += 12 + length;
        if (type === 'IHDR') {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            depth = body[8]!;
            colorType = body[9]!;
            // Interlacing reorders the rows into seven passes, which no skin editor writes.
            if (body[12] !== 0) return undefined;
        } else if (type === 'PLTE') palette = body;
        else if (type === 'tRNS') transparency = body;
        else if (type === 'IDAT') data.push(body);
        else if (type === 'IEND') break;
    }
    const channels = CHANNELS[colorType];
    const readable = colorType === 3 ? depth <= 8 && palette !== undefined : depth === 8;
    if (channels === undefined || !readable || width === 0 || height === 0 || width > 512 || height > 512) {
        return undefined;
    }
    let raw: Buffer;
    try {
        raw = inflateSync(Buffer.concat(data));
    } catch {
        return undefined;
    }
    const bitsPerPixel = channels * depth;
    const stride = Math.ceil((width * bitsPerPixel) / 8);
    const step = Math.max(1, bitsPerPixel / 8);
    if (raw.byteLength < height * (stride + 1)) return undefined;

    // Undo each row's filter against the row above, already unfiltered.
    const rows = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)]!;
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
            if (filter > 4) return undefined;
            row[x] = (line[x]! + predicted) & 0xff;
        }
    }

    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        const row = rows.subarray(y * stride, (y + 1) * stride);
        for (let x = 0; x < width; x++) {
            const out = (y * width + x) * 4;
            if (colorType === 3) {
                const bit = x * depth;
                const index = (row[bit >> 3]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
                palette!.copy(rgba, out, index * 3, index * 3 + 3);
                rgba[out + 3] = transparency?.[index] ?? 0xff;
                continue;
            }
            const pixel = row.subarray(x * channels, (x + 1) * channels);
            const gray = colorType === 0 || colorType === 4;
            rgba[out] = pixel[0]!;
            rgba[out + 1] = gray ? pixel[0]! : pixel[1]!;
            rgba[out + 2] = gray ? pixel[0]! : pixel[2]!;
            rgba[out + 3] = colorType === 4 ? pixel[1]! : colorType === 6 ? pixel[3]! : 0xff;
        }
    }
    return { width, height, rgba };
};

/**
 * The copies that turn a 64x32 skin into the 64x64 layout: the right leg and arm, mirrored, as
 * the left ones, as the Java client converts an old skin. Each is the source corner, the offset
 * to the target, and the size.
 */
const LEGACY_COPIES: readonly (readonly [number, number, number, number, number, number])[] = [
    [4, 16, 16, 32, 4, 4],
    [8, 16, 16, 32, 4, 4],
    [0, 20, 24, 32, 4, 12],
    [4, 20, 16, 32, 4, 12],
    [8, 20, 8, 32, 4, 12],
    [12, 20, 16, 32, 4, 12],
    [44, 16, -8, 32, 4, 4],
    [48, 16, -8, 32, 4, 4],
    [40, 20, 0, 32, 4, 12],
    [44, 20, -8, 32, 4, 12],
    [48, 20, -16, 32, 4, 12],
    [52, 20, -8, 32, 4, 12]
];

/** The base layers, from corner to corner, which the Java client draws opaque whatever the file says. */
const OPAQUE_REGIONS: readonly (readonly [number, number, number, number])[] = [
    [0, 0, 32, 16],
    [0, 16, 64, 32],
    [16, 48, 48, 64]
];

/** The hat layer of a 64x32 skin, which the Java client clears when no pixel of it is see-through. */
const LEGACY_HAT: readonly [number, number, number, number] = [32, 0, 64, 32];

/** Each pixel's alpha byte in a region of the sheet. */
const alphaOffsets = function* ([x0, y0, x1, y1]: readonly [number, number, number, number]) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) yield (y * SKIN_WIDTH + x) * 4 + 3;
};

/**
 * The sheet a Bedrock client draws, as the Java client's `SkinTextureDownloader` prepares a skin:
 * a 64x32 one moved into the 64x64 layout with its leg and arm mirrored, its hat cleared when it
 * is wholly opaque, and every skin's base layers made opaque.
 * @param image - The decoded skin.
 * @returns 64 * 64 * 4 bytes of RGBA, or undefined for an image of another size.
 */
export const skinSheetOf = (image: RgbaImage): Buffer | undefined => {
    if (image.width !== SKIN_WIDTH || (image.height !== SKIN_HEIGHT && image.height !== SKIN_HEIGHT / 2)) {
        return undefined;
    }
    const legacy = image.height !== SKIN_HEIGHT;
    const sheet = Buffer.alloc(SKIN_WIDTH * SKIN_HEIGHT * 4);
    image.rgba.copy(sheet);
    if (legacy) {
        for (const [x, y, dx, dy, width, height] of LEGACY_COPIES) {
            for (let row = 0; row < height; row++) {
                for (let column = 0; column < width; column++) {
                    const from = ((y + row) * SKIN_WIDTH + x + column) * 4;
                    const to = ((y + dy + row) * SKIN_WIDTH + x + dx + width - 1 - column) * 4;
                    sheet.copy(sheet, to, from, from + 4);
                }
            }
        }
        // Old skins drew the hat solid where they meant none, so a wholly opaque one is cleared.
        if ([...alphaOffsets(LEGACY_HAT)].every((offset) => sheet[offset]! >= 128)) {
            for (const offset of alphaOffsets(LEGACY_HAT)) sheet[offset] = 0;
        }
    }
    for (const region of OPAQUE_REGIONS) for (const offset of alphaOffsets(region)) sheet[offset] = 0xff;
    return sheet;
};

/**
 * A Bedrock skin from a Java skin's sheet, on the classic humanoid or its slim-armed variant.
 * @param sheet - 64 * 64 * 4 bytes of RGBA.
 * @param slim - Whether the arms are the slim ones.
 * @param url - The texture's address, whose last segment, a hash of the image, names the skin.
 * @returns The skin.
 */
export const bedrockSkinOf = (sheet: Buffer, slim: boolean, url: string): Skin =>
    Skin.fromJWT({
        SkinId: `jsprismarine:java_${url.slice(url.lastIndexOf('/') + 1)}`,
        CapeId: '',
        SkinResourcePatch: Buffer.from(
            slim
                ? JSON.stringify({ geometry: { default: 'geometry.humanoid.customSlim' } })
                : DEFAULT_SKIN_RESOURCE_PATCH
        ).toString('base64'),
        PlayFabId: '',
        SkinImageHeight: SKIN_HEIGHT,
        SkinImageWidth: SKIN_WIDTH,
        SkinGeometryData: '',
        SkinAnimationData: '',
        CapeImageHeight: 0,
        CapeImageWidth: 0,
        CapeOnClassicSkin: false,
        SkinData: sheet.toString('base64'),
        CapeData: '',
        PremiumSkin: false,
        PersonaSkin: false,
        SkinColor: '#0',
        ArmSize: slim ? 'slim' : 'wide',
        AnimatedImageData: [],
        PersonaPieces: [],
        PieceTintColors: []
    });

/** Sends a request; the global `fetch` unless a test gives another. */
export type SkinFetch = (url: string, init: { readonly signal: AbortSignal }) => Promise<Response>;

/**
 * The Bedrock skin for a Java player's own skin, fetched from Mojang's texture server.
 * @param property - The profile's signed `textures` property.
 * @param fetchTexture - Sends the request.
 * @returns The skin, or undefined when the profile names none, or the texture cannot be read in
 *   time, which leaves the player on the default skin.
 */
export const fetchJavaSkin = async (
    property: JavaTexturesProperty,
    fetchTexture: SkinFetch = fetch
): Promise<Skin | undefined> => {
    const texture = skinTextureOf(property.value);
    if (texture === undefined) return undefined;
    try {
        const response = await fetchTexture(texture.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!response.ok) return undefined;
        const png = Buffer.from(await response.arrayBuffer());
        if (png.byteLength > MAX_PNG_BYTES) return undefined;
        const image = decodePng(png);
        const sheet = image === undefined ? undefined : skinSheetOf(image);
        return sheet === undefined ? undefined : bedrockSkinOf(sheet, texture.slim, texture.url);
    } catch {
        // Down, slow or refusing: the player keeps the default skin.
        return undefined;
    }
};
