/**
 * A map's saved data: Java's `MapItemSavedData`, as much of it as an explorer map needs.
 *
 * Java keeps a map's center, scale, dimension, decorations and 128 by 128 pixels apart from
 * the item, under the `minecraft:map_id` the item carries, and so does this. The pixels are
 * not kept: an explorer map's are its biome preview, which is a function of the world seed,
 * so {@link biomePreviewColors} draws them again when a client asks rather than saving 16 KiB
 * per map.
 *
 * Every number below is read off the 26.3 server: `MapItemSavedData.createFresh`,
 * `addDecoration`, `clampMapCoordinate` and `calculateRotation`, `MapItem.renderBiomePreviewMap`,
 * `Mth.sin`, `MapColor` and `ARGB.scaleRGB`.
 */
import type { MapDecorationEntry } from '@jsprismarine/predicates';

/** A map's width and height in pixels. */
export const MAP_SIZE = 128;

/** One marker on a saved map, in Java's map coordinates. */
export interface SavedMapDecoration {
    /** Namespaced map decoration type, such as `minecraft:red_x`. */
    readonly type: string;
    /** The marker's offset from the map's center in half pixels, a signed byte as Java stores it. */
    readonly x: number;
    readonly y: number;
    /** Which way it faces, in sixteenths of a turn. */
    readonly rotation: number;
}

/** One map, as a level keeps it under its id. */
export interface SavedMap {
    /** The level's id for the dimension the map shows, such as `minecraft:overworld`. */
    readonly dimension: string;
    /** The block at the map's center. */
    readonly centerX: number;
    readonly centerZ: number;
    /** How far the map is zoomed out: one pixel is `2^scale` blocks. */
    readonly scale: number;
    readonly decorations: readonly SavedMapDecoration[];
}

/** What a new map is made from; see {@link newSavedMap}. */
export interface NewSavedMap {
    readonly dimension: string;
    /** A position the map covers, in blocks. */
    readonly x: number;
    readonly z: number;
    readonly scale: number;
    readonly decorations: Readonly<Record<string, MapDecorationEntry>>;
}

/**
 * Java's `MapItemSavedData.createFresh` center: the map grid is `128 * 2^scale` blocks a cell,
 * offset by 64 so the world origin sits near a cell's corner, and a map centers on its cell.
 */
const centerOf = (position: number, scale: number): number => {
    const size = MAP_SIZE * (1 << scale);
    return Math.floor((position + 64) / size) * size + Math.trunc(size / 2) - 64;
};

/** Java's `(byte)` cast, which keeps the low eight bits as a signed value. */
const toByte = (value: number): number => (value << 24) >> 24;

/**
 * Java's `clampMapCoordinate`: a pixel offset as a signed byte in half pixels, pinned to the
 * map's edge outside it.
 */
const clampMapCoordinate = (pixels: number): number => {
    if (pixels <= -63) return -128;
    if (pixels >= 63) return 127;
    return toByte(Math.trunc(Math.fround(pixels * 2) + 0.5));
};

/**
 * Java's `calculateRotation` away from the Nether: degrees to sixteenths of a turn, rounded
 * half a step outward. A Nether map spins its markers by the game clock instead; explorer maps
 * are made in the Overworld, so that branch is not here.
 */
const rotationOf = (degrees: number): number => toByte(Math.trunc(((degrees + (degrees < 0 ? -8 : 8)) * 16) / 360));

/**
 * One marker placed on a map, as Java's `addDecoration` places it.
 *
 * An explorer map is made with unlimited tracking, so a marker outside the map stays on it,
 * pinned to the edge, rather than being dropped.
 */
export const decorationOnMap = (
    map: Pick<SavedMap, 'centerX' | 'centerZ' | 'scale'>,
    entry: MapDecorationEntry
): SavedMapDecoration => {
    const step = 1 << map.scale;
    const pixelsX = Math.fround(Math.fround(entry.x - map.centerX) / step);
    const pixelsZ = Math.fround(Math.fround(entry.z - map.centerZ) / step);
    return {
        type: entry.type,
        x: clampMapCoordinate(pixelsX),
        y: clampMapCoordinate(pixelsZ),
        rotation: rotationOf(entry.rotation)
    };
};

/** A map made around a position, Java's `MapItem.create` with the decorations it starts with. */
export const newSavedMap = (request: NewSavedMap): SavedMap => {
    // As given: Java's `MapItemSavedData` stores the zoom a map was made with unclamped.
    const scale = Math.trunc(request.scale);
    const placed = { centerX: centerOf(request.x, scale), centerZ: centerOf(request.z, scale), scale };
    return {
        dimension: request.dimension,
        ...placed,
        decorations: Object.values(request.decorations).map((entry) => decorationOnMap(placed, entry))
    };
};

/** `Mth.sin`: a 65536-entry table over one turn, indexed by the angle's low 16 bits. */
const SIN_STEPS_PER_RADIAN = 10430.378350470453;
const javaSin = (radians: number): number => {
    const index = ((Math.trunc(radians * SIN_STEPS_PER_RADIAN) % 65536) + 65536) % 65536;
    return Math.fround(Math.sin(index / SIN_STEPS_PER_RADIAN));
};

/** `MapColor$Brightness`, by the id Java packs beside the color and the multiplier it applies. */
const BRIGHTNESS = {
    LOW: { id: 0, modifier: 180 },
    NORMAL: { id: 1, modifier: 220 },
    HIGH: { id: 2, modifier: 255 },
    LOWEST: { id: 3, modifier: 135 }
} as const;

type Brightness = (typeof BRIGHTNESS)[keyof typeof BRIGHTNESS];

/** The two `MapColor`s a biome preview draws with, by id and base RGB. */
const ORANGE = { id: 15, rgb: 0xd87f33 } as const;
const BROWN = { id: 26, rgb: 0x664c33 } as const;
const PREVIEW_COLORS: ReadonlyMap<number, number> = new Map([
    [ORANGE.id, ORANGE.rgb],
    [BROWN.id, BROWN.rgb]
]);
const BRIGHTNESS_MODIFIERS: readonly number[] = [
    BRIGHTNESS.LOW.modifier,
    BRIGHTNESS.NORMAL.modifier,
    BRIGHTNESS.HIGH.modifier,
    BRIGHTNESS.LOWEST.modifier
];

/** `MapColor.getPackedId`: the color id in the high six bits, the brightness in the low two. */
const packed = (color: { readonly id: number }, brightness: Brightness): number => (color.id << 2) | brightness.id;

/**
 * Java's `MapItem.renderBiomePreviewMap`: the outline of the water an explorer map is drawn
 * with before anyone has walked it.
 *
 * Every pixel samples one biome at sea level and asks whether it is in
 * `#minecraft:water_on_map_outlines`. A water pixel with dry neighbors is drawn as an orange
 * coast, darker the drier its neighborhood; open water is left blank except for a wavy band
 * of stripes. A dry pixel beside water is drawn brown. The outermost ring of pixels is never
 * drawn.
 *
 * @param map - The map's center and scale.
 * @param isWater - Whether the biome at a block, sampled at sea level, is outlined as water.
 * @returns Java's packed color ids, `x + z * 128`, with 0 for an undrawn pixel.
 */
export const biomePreviewColors = (
    map: Pick<SavedMap, 'centerX' | 'centerZ' | 'scale'>,
    isWater: (x: number, z: number) => boolean
): Uint8Array => {
    const step = 1 << map.scale;
    // Java's integer division, which rounds toward zero for a center west or north of the origin.
    const left = Math.trunc(map.centerX / step) - 64;
    const top = Math.trunc(map.centerZ / step) - 64;

    const water = new Uint8Array(MAP_SIZE * MAP_SIZE);
    for (let z = 0; z < MAP_SIZE; z++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            water[z * MAP_SIZE + x] = isWater((left + x) * step, (top + z) * step) ? 1 : 0;
        }
    }
    const watery = (x: number, z: number): boolean => water[z * MAP_SIZE + x] === 1;

    const colors = new Uint8Array(MAP_SIZE * MAP_SIZE);
    for (let x = 1; x < MAP_SIZE - 1; x++) {
        for (let z = 1; z < MAP_SIZE - 1; z++) {
            let wetNeighbors = 0;
            for (let dx = -1; dx < 2; dx++) {
                for (let dz = -1; dz < 2; dz++) {
                    if ((dx !== 0 || dz !== 0) && watery(x + dx, z + dz)) wetNeighbors++;
                }
            }

            let color: { readonly id: number } | undefined;
            let brightness: Brightness = BRIGHTNESS.LOWEST;
            if (watery(x, z)) {
                color = ORANGE;
                if (wetNeighbors > 7 && z % 2 === 0) {
                    // Java's int arithmetic: `(int) (sin * 7f)` truncates, and so do `/` and `%`.
                    const band = Math.trunc((x + Math.trunc(Math.fround(javaSin(z) * 7))) / 8) % 5;
                    if (band === 0 || band === 4) brightness = BRIGHTNESS.LOW;
                    else if (band === 1 || band === 3) brightness = BRIGHTNESS.NORMAL;
                    else if (band === 2) brightness = BRIGHTNESS.HIGH;
                } else if (wetNeighbors > 7) {
                    color = undefined;
                } else if (wetNeighbors > 5) {
                    brightness = BRIGHTNESS.NORMAL;
                } else if (wetNeighbors > 1) {
                    // Java tests more than 3 and more than 1 separately, and both choose LOW.
                    brightness = BRIGHTNESS.LOW;
                }
            } else if (wetNeighbors > 0) {
                color = BROWN;
                brightness = wetNeighbors > 3 ? BRIGHTNESS.NORMAL : BRIGHTNESS.LOWEST;
            }

            if (color !== undefined) colors[x + z * MAP_SIZE] = packed(color, brightness);
        }
    }
    return colors;
};

/**
 * One packed Java map color as a Bedrock pixel: `MapColor.calculateARGBColor` with the
 * channels in the order a Bedrock client reads them, red in the low byte and alpha in the
 * high one. An undrawn pixel is fully transparent, which the client draws as bare parchment.
 *
 * Only the colors {@link biomePreviewColors} draws are known; any other id is undrawn.
 */
export const bedrockPixelOf = (packedId: number): number => {
    const rgb = PREVIEW_COLORS.get(packedId >> 2);
    const modifier = BRIGHTNESS_MODIFIERS[packedId & 3];
    if (rgb === undefined || modifier === undefined) return 0;
    // `ARGB.scaleRGB`: each channel times the modifier over 255, in long arithmetic.
    const scale = (channel: number): number => Math.trunc((channel * modifier) / 255);
    const red = scale((rgb >> 16) & 0xff);
    const green = scale((rgb >> 8) & 0xff);
    const blue = scale(rgb & 0xff);
    return (0xff000000 | (blue << 16) | (green << 8) | red) >>> 0;
};
