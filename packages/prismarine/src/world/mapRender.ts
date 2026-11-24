/**
 * A map filling in around the player holding it: Java 26.3's `MapItem.update`.
 *
 * Each call redraws one sixteenth of the columns within reach of the holder, chosen by the
 * holder's step, and the column after any pixel that changed, so a held map fills in over sixteen
 * ticks and follows changes as they happen. A pixel stands for `2^scale` by `2^scale` blocks and
 * takes the color most of them show from above, shaded by how the ground rises from the pixel
 * north of it, or for water by how deep it is. The edge of the reach is dithered, and a pixel in
 * a chunk that is not loaded is left as it is.
 */
import { MapColors, Brightness, packedMapColor } from './mapColors';
import type { SavedMap } from './savedMap';
import { MAP_SIZE } from './savedMap';

/** One column of blocks, as a map sees it from above. */
export interface MapColumn {
    /** The id of the color the map draws it with; see `mapColors.ts`. */
    readonly colorId: number;
    /** The height of the block drawn, Java's `columnY`. */
    readonly y: number;
    /** How many fluid blocks lie under the top one, for a column topped by a fluid. */
    readonly waterDepth: number;
}

/** What a map reads of the dimension it shows. */
export interface MapTerrain {
    /** Whether the dimension has a ceiling, which a map draws as noise rather than terrain. */
    readonly hasCeiling: boolean;
    /** Whether the chunk holding a block is loaded. */
    isLoaded(x: number, z: number): boolean;
    /** The column at a block, in a loaded chunk. */
    column(x: number, z: number): MapColumn;
}

/** Writes one pixel and answers whether it changed, Java's `MapItemSavedData.updateColor`. */
export type MapPainter = (x: number, z: number, packedColor: number) => boolean;

/**
 * Redraws the part of a map near its holder that the holder's step picks.
 *
 * @param map - The map's center and scale.
 * @param holder - Where the holder stands, in blocks, and its step, which the caller advances once
 *   per call as Java's `HoldingPlayer.step` is.
 * @param terrain - The dimension the map shows, which must be the one the holder is in.
 * @param paint - Writes a pixel.
 */
export const updateMapAround = (
    map: Pick<SavedMap, 'centerX' | 'centerZ' | 'scale'>,
    holder: { readonly x: number; readonly z: number; readonly step: number },
    terrain: MapTerrain,
    paint: MapPainter
): void => {
    const scale = 1 << map.scale;
    // Java's int division throughout, which truncates toward zero.
    const playerImgX = Math.trunc(Math.floor(holder.x - map.centerX) / scale) + 64;
    const playerImgY = Math.trunc(Math.floor(holder.z - map.centerZ) / scale) + 64;
    let radius = Math.trunc(MAP_SIZE / scale);
    if (terrain.hasCeiling) radius = Math.trunc(radius / 2);

    let foundConsecutiveChanges = false;
    for (let imgX = playerImgX - radius + 1; imgX < playerImgX + radius; imgX++) {
        if ((imgX & 15) !== (holder.step & 15) && !foundConsecutiveChanges) continue;
        foundConsecutiveChanges = false;
        let previousAverageAreaHeight = 0;

        // From the row north of the reach, which only seeds the shading of the first row drawn.
        for (let imgY = playerImgY - radius - 1; imgY < playerImgY + radius; imgY++) {
            if (imgX < 0 || imgY < -1 || imgX >= MAP_SIZE || imgY >= MAP_SIZE) continue;

            const distanceToPlayerSqr = (imgX - playerImgX) ** 2 + (imgY - playerImgY) ** 2;
            const ditherBlack = distanceToPlayerSqr > (radius - 2) * (radius - 2);
            const minX = (Math.trunc(map.centerX / scale) + imgX - 64) * scale;
            const minZ = (Math.trunc(map.centerZ / scale) + imgY - 64) * scale;
            // The pixel's blocks share one chunk: the area is `scale` wide and aligned to it.
            if (!terrain.isLoaded(minX, minZ)) continue;

            const pixel = terrain.hasCeiling ? ceilingPixel(minX, minZ) : terrainPixel(minX, minZ, scale, terrain);
            const checker = (imgX + imgY) & 1;
            let brightness: Brightness;
            if (pixel.colorId === MapColors.water.id) {
                const diff = pixel.waterDepth * 0.1 + checker * 0.2;
                brightness = diff < 0.5 ? Brightness.HIGH : diff > 0.9 ? Brightness.LOW : Brightness.NORMAL;
            } else {
                const diff =
                    ((pixel.averageHeight - previousAverageAreaHeight) * 4) / (scale + 4) + (checker - 0.5) * 0.4;
                brightness = diff > 0.6 ? Brightness.HIGH : diff < -0.6 ? Brightness.LOW : Brightness.NORMAL;
            }
            previousAverageAreaHeight = pixel.averageHeight;

            if (imgY >= 0 && distanceToPlayerSqr < radius * radius && (!ditherBlack || checker !== 0)) {
                if (paint(imgX, imgY, packedMapColor(pixel.colorId, brightness))) foundConsecutiveChanges = true;
            }
        }
    }
};

/** What one pixel's blocks come to. */
interface Pixel {
    readonly colorId: number;
    readonly averageHeight: number;
    readonly waterDepth: number;
}

/**
 * A pixel of a dimension with a ceiling, which Java draws as dirt or stone by a hash of its
 * corner rather than from the blocks, so a Nether map shows no terrain.
 */
const ceilingPixel = (minX: number, minZ: number): Pixel => {
    // Java's int arithmetic, which wraps.
    let noise = (minX + Math.imul(minZ, 231871)) | 0;
    noise = (Math.imul(Math.imul(noise, noise), 31287121) + Math.imul(noise, 11)) | 0;
    const colorId = ((noise >> 20) & 1) === 0 ? MapColors.dirt.id : MapColors.stone.id;
    return { colorId, averageHeight: 100, waterDepth: 0 };
};

/**
 * A pixel drawn from its blocks: the color most of its columns show, ties going to the first one
 * seen as Guava's `Multisets.copyHighestCountFirst` orders them, their mean height and their
 * mean water depth, in Java's int division.
 */
const terrainPixel = (minX: number, minZ: number, scale: number, terrain: MapTerrain): Pixel => {
    const colors: number[] = [];
    const counts: number[] = [];
    let averageHeight = 0;
    let waterDepth = 0;
    for (let dx = 0; dx < scale; dx++) {
        for (let dz = 0; dz < scale; dz++) {
            const column = terrain.column(minX + dx, minZ + dz);
            averageHeight += column.y / (scale * scale);
            waterDepth += column.waterDepth;
            const seen = colors.indexOf(column.colorId);
            if (seen === -1) {
                colors.push(column.colorId);
                counts.push(1);
            } else {
                counts[seen]! += 1;
            }
        }
    }

    let colorId = colors[0] ?? MapColors.none.id;
    let best = counts[0] ?? 0;
    for (let index = 1; index < colors.length; index++) {
        if (counts[index]! > best) {
            best = counts[index]!;
            colorId = colors[index]!;
        }
    }
    return { colorId, averageHeight, waterDepth: Math.trunc(waterDepth / (scale * scale)) };
};
