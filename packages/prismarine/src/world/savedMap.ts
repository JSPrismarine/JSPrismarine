/**
 * A map's saved data: Java's `MapItemSavedData`, short of banners and item frames.
 *
 * Java keeps a map's center, scale, dimension, decorations and 128 by 128 pixels apart from
 * the item, under the `minecraft:map_id` the item carries, and so does this. An explorer map's
 * first pixels are its biome preview, which is a function of the world seed, so it is drawn
 * ({@link drawnColors}) the first time something needs the pixels rather than when the map is
 * made: until then {@link SavedMap.colors} is undefined.
 *
 * Every number below is read off the 26.3 server: `MapItemSavedData.createFresh`,
 * `addDecoration`, `clampMapCoordinate` and `calculateRotation`, `MapItem.renderBiomePreviewMap`
 * and `Mth.sin`.
 */
import type { MapDecorationEntry } from '@jsprismarine/predicates';

import { Brightness, MapColors, packedMapColor } from './mapColors';

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
    /** The markers the map was made with, such as an explorer map's target. */
    readonly decorations: readonly SavedMapDecoration[];
    /** Whether a holder's marker is drawn, Java's `trackingPosition`. */
    readonly trackingPosition: boolean;
    /**
     * Whether a marker outside the map stays on it, pinned to the edge, and a holder far off it
     * is still drawn as a small dot. Java makes explorer maps this way and empty maps not.
     */
    readonly unlimitedTracking: boolean;
    /** Whether a cartography table locked the map, which stops it filling in. */
    readonly locked: boolean;
    /**
     * Java's packed color ids, `x + z * 128`, with 0 for an undrawn pixel; see `mapColors.ts`.
     * Undefined for an explorer map whose biome preview is not drawn yet.
     */
    colors: Uint8Array | undefined;
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
 *
 * @javaSource MapItemSavedData.createFresh
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
 * half a step outward. An explorer map's own markers are placed in the Overworld, so only a
 * holder's marker takes the Nether's spin ({@link holderDecorationOnMap}).
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

/** Whether a marker's offset is on the map, Java's `isInsideMap`. */
const isInsideMap = (pixelsX: number, pixelsZ: number): boolean =>
    pixelsX >= -63 && pixelsZ >= -63 && pixelsX <= 63 && pixelsZ <= 63;

/** How far off the map a holder is still drawn at its edge, in pixels. */
const OFF_MAP_RANGE = 320;

/** Java's `calculateRotation` in the Nether: markers spin by the game clock rather than face a way. */
const netherRotationOf = (gameTime: number): number => {
    const step = Math.trunc(gameTime / 10) | 0;
    return ((Math.imul(Math.imul(step, step), 34187121) + Math.imul(step, 121)) >> 15) & 15;
};

/** Where a holder stands, for its marker. */
export interface MapHolderPosition {
    readonly x: number;
    readonly z: number;
    /** Which way it faces, in degrees. */
    readonly yaw: number;
    /** The level's game time, which spins a marker in the Nether. */
    readonly gameTime: number;
}

/**
 * A holder's marker on a map, as Java's `addDecoration` places a `minecraft:player`: an arrow
 * on the map, a dot at its edge within 320 pixels of it, and a small dot further off for a map
 * with unlimited tracking. Undefined when the holder is too far off to draw.
 */
export const holderDecorationOnMap = (
    map: Pick<SavedMap, 'centerX' | 'centerZ' | 'scale' | 'dimension' | 'unlimitedTracking'>,
    position: MapHolderPosition
): SavedMapDecoration | undefined => {
    const step = 1 << map.scale;
    const pixelsX = Math.fround(Math.fround(position.x - map.centerX) / step);
    const pixelsZ = Math.fround(Math.fround(position.z - map.centerZ) / step);
    let type = 'minecraft:player';
    if (!isInsideMap(pixelsX, pixelsZ)) {
        if (Math.abs(pixelsX) < OFF_MAP_RANGE && Math.abs(pixelsZ) < OFF_MAP_RANGE) type = 'minecraft:player_off_map';
        else if (map.unlimitedTracking) type = 'minecraft:player_off_limits';
        else return undefined;
    }
    return {
        type,
        x: clampMapCoordinate(pixelsX),
        y: clampMapCoordinate(pixelsZ),
        rotation:
            map.dimension === 'minecraft:the_nether' ? netherRotationOf(position.gameTime) : rotationOf(position.yaw)
    };
};

/**
 * An explorer map made around a position, Java's `MapItem.create` with unlimited tracking and the
 * decorations it starts with. Its pixels are the biome preview, drawn later.
 *
 * @javaSource MapItem.create
 */
export const newSavedMap = (request: NewSavedMap): SavedMap => {
    // As given: Java's `MapItemSavedData` stores the zoom a map was made with unclamped.
    const scale = Math.trunc(request.scale);
    const placed = { centerX: centerOf(request.x, scale), centerZ: centerOf(request.z, scale), scale };
    return {
        dimension: request.dimension,
        ...placed,
        decorations: Object.values(request.decorations).map((entry) => decorationOnMap(placed, entry)),
        trackingPosition: true,
        unlimitedTracking: true,
        locked: false,
        colors: undefined
    };
};

/**
 * Java's `MapItemSavedData.MAX_SCALE`, the furthest a map zooms out.
 *
 * @javaSource MapItemSavedData.MAX_SCALE
 */
export const MAX_MAP_SCALE = 4;

/** What a blank map is made from; see {@link blankSavedMap}. */
export interface BlankSavedMap {
    readonly dimension: string;
    /** A position the map covers, in blocks. */
    readonly x: number;
    readonly z: number;
    readonly scale: number;
}

/**
 * A map with nothing drawn on it, made around a position: Java's `MapItemSavedData.createFresh`
 * as an empty map and a zoomed-out copy make it, tracking its holders within reach of the map.
 *
 * @javaSource MapItemSavedData.createFresh
 */
export const blankSavedMap = (request: BlankSavedMap): SavedMap => {
    const scale = Math.trunc(request.scale);
    return {
        dimension: request.dimension,
        centerX: centerOf(request.x, scale),
        centerZ: centerOf(request.z, scale),
        scale,
        decorations: [],
        trackingPosition: true,
        unlimitedTracking: false,
        locked: false,
        colors: new Uint8Array(MAP_SIZE * MAP_SIZE)
    };
};

/**
 * The pixels of a map, drawing an explorer map's biome preview first when it has none yet.
 *
 * @param isWater - Whether the biome at a block, sampled at sea level, is outlined as water.
 */
export const drawnColors = (map: SavedMap, isWater: (x: number, z: number) => boolean): Uint8Array => {
    map.colors ??= biomePreviewColors(map, isWater);
    return map.colors;
};

/** `Mth.sin`: a 65536-entry table over one turn, indexed by the angle's low 16 bits. */
const SIN_STEPS_PER_RADIAN = 10430.378350470453;
const javaSin = (radians: number): number => {
    const index = ((Math.trunc(radians * SIN_STEPS_PER_RADIAN) % 65536) + 65536) % 65536;
    return Math.fround(Math.sin(index / SIN_STEPS_PER_RADIAN));
};

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
 * @javaSource MapItem.renderBiomePreviewMap
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
            let brightness: Brightness = Brightness.LOWEST;
            if (watery(x, z)) {
                color = MapColors.color_orange;
                if (wetNeighbors > 7 && z % 2 === 0) {
                    // Java's int arithmetic: `(int) (sin * 7f)` truncates, and so do `/` and `%`.
                    const band = Math.trunc((x + Math.trunc(Math.fround(javaSin(z) * 7))) / 8) % 5;
                    if (band === 0 || band === 4) brightness = Brightness.LOW;
                    else if (band === 1 || band === 3) brightness = Brightness.NORMAL;
                    else if (band === 2) brightness = Brightness.HIGH;
                } else if (wetNeighbors > 7) {
                    color = undefined;
                } else if (wetNeighbors > 5) {
                    brightness = Brightness.NORMAL;
                } else if (wetNeighbors > 1) {
                    // Java tests more than 3 and more than 1 separately, and both choose LOW.
                    brightness = Brightness.LOW;
                }
            } else if (wetNeighbors > 0) {
                color = MapColors.color_brown;
                brightness = wetNeighbors > 3 ? Brightness.NORMAL : Brightness.LOWEST;
            }

            if (color !== undefined) colors[x + z * MAP_SIZE] = packedMapColor(color.id, brightness);
        }
    }
    return colors;
};
