/** A Bedrock skin texture is always RGBA, and 64x64 is the classic layout. */
export const SKIN_WIDTH = 64;
export const SKIN_HEIGHT = 64;
const BYTES_PER_PIXEL = 4;

/**
 * The regions of the 64x64 sheet the classic humanoid geometry samples, and what to fill
 * each with. Everything outside them is left transparent, exactly as an unused area of a
 * real sheet is.
 *
 * Coordinates come from the geometry, not from any Mojang artwork - `geometry.humanoid.custom`
 * is a name the client resolves against its own built-in model, and the layout it implies is
 * a fact about the format rather than an asset. What fills them is ours.
 */
interface Region {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly colour: readonly [number, number, number];
}

const SKIN_TONE: readonly [number, number, number] = [0xc8, 0x9f, 0x7b];
const SHIRT: readonly [number, number, number] = [0x3f, 0x6f, 0xa8];
const TROUSERS: readonly [number, number, number] = [0x39, 0x3f, 0x52];
const HAIR: readonly [number, number, number] = [0x4a, 0x36, 0x28];

const REGIONS: readonly Region[] = [
    // Head: the top strip is hair, the rest is face.
    { x: 0, y: 0, width: 32, height: 8, colour: HAIR },
    { x: 0, y: 8, width: 32, height: 8, colour: SKIN_TONE },
    // Body and arms.
    { x: 16, y: 16, width: 24, height: 16, colour: SHIRT },
    { x: 40, y: 16, width: 16, height: 16, colour: SHIRT },
    { x: 32, y: 48, width: 16, height: 16, colour: SHIRT },
    // Legs.
    { x: 0, y: 16, width: 16, height: 16, colour: TROUSERS },
    { x: 16, y: 48, width: 16, height: 16, colour: TROUSERS }
];

/**
 * The skin the client wears when nothing else has been supplied.
 *
 * Generated rather than shipped as a PNG, and generated from flat colour blocks that are
 * ours: Mojang's textures cannot be redistributed, and a client that refuses to log in
 * without one would be useless. It is deliberately plain - the point is a valid, original
 * 16 KiB of RGBA, not a good-looking character.
 *
 * @returns 64 * 64 * 4 bytes of RGBA, row major from the top left.
 */
export const createDefaultSkinImage = (): Buffer => {
    const image = Buffer.alloc(SKIN_WIDTH * SKIN_HEIGHT * BYTES_PER_PIXEL);

    for (const region of REGIONS) {
        for (let y = region.y; y < region.y + region.height; y++) {
            for (let x = region.x; x < region.x + region.width; x++) {
                const offset = (y * SKIN_WIDTH + x) * BYTES_PER_PIXEL;
                // A touch of vertical shading, so the model is not a flat silhouette. Cheap,
                // deterministic, and it keeps the generated sheet from looking like an error.
                const shade = 1 - ((y - region.y) / region.height) * 0.15;
                image[offset] = Math.round(region.colour[0] * shade);
                image[offset + 1] = Math.round(region.colour[1] * shade);
                image[offset + 2] = Math.round(region.colour[2] * shade);
                image[offset + 3] = 0xff;
            }
        }
    }

    return image;
};

/**
 * Which model the client should hang the texture on.
 *
 * `geometry.humanoid.custom` is resolved by the client against a model it already has, so
 * this is a reference rather than geometry we would have to ship. `SkinGeometryData` stays
 * empty for the same reason.
 */
export const DEFAULT_SKIN_RESOURCE_PATCH = JSON.stringify({
    geometry: { default: 'geometry.humanoid.custom' }
});
