/**
 * Java's `BlendingData`: what an old chunk tells the blender about its edges.
 *
 * Java marks a chunk "old" when a different generator made it: a pre-1.18 chunk, or since 26.3
 * any overworld chunk saved before data version 4997. The marked chunk keeps its terrain. A new
 * chunk generated next to it reads this record and bends its own heights, densities and biomes
 * toward the old chunk's, so the seam is a slope rather than a cliff.
 *
 * The record covers the cell columns on the chunk's north and west edges (inside the chunk) and
 * on its east and south edges (one cell past them), sixteen in all, and only on the sides that
 * face a new chunk. For each it holds the surface height, a column of coarse densities read from
 * the blocks, and the column of stored biomes.
 */
import { f32, floorDiv } from '../math';

/** Java's `Float.MAX_VALUE`, which marks a height or density the record has no value for. */
export const BLENDING_NO_VALUE = 3.4028234663852886e38;

/** One cell is four blocks wide, a quart. */
const QUARTS_PER_SECTION = 4;
const CELL_HORIZONTAL_MAX_INDEX_INSIDE = QUARTS_PER_SECTION - 1;
const CELL_HORIZONTAL_MAX_INDEX_OUTSIDE = QUARTS_PER_SECTION;
const CELL_COLUMN_INSIDE_COUNT = 2 * CELL_HORIZONTAL_MAX_INDEX_INSIDE + 1;
const CELL_COLUMN_OUTSIDE_COUNT = 2 * CELL_HORIZONTAL_MAX_INDEX_OUTSIDE + 1;

/** How many cell columns a record holds: seven inside the chunk and nine outside it. */
export const BLENDING_CELL_COLUMN_COUNT = CELL_COLUMN_INSIDE_COUNT + CELL_COLUMN_OUTSIDE_COUNT;

/** Java's `BLENDING_DENSITY_FACTOR`, which every density the record hands out is scaled by. */
const BLENDING_DENSITY_FACTOR = f32(0.1);

/**
 * The blocks Java's `BlendingData.getHeightAtXZ` accepts as an old chunk's surface, by Java id.
 *
 * Exported so a caller reading an old chunk stored in another edition can map the same list.
 */
export const BLENDING_SURFACE_BLOCKS: readonly string[] = [
    'minecraft:podzol',
    'minecraft:gravel',
    'minecraft:grass_block',
    'minecraft:stone',
    'minecraft:coarse_dirt',
    'minecraft:sand',
    'minecraft:red_sand',
    'minecraft:mycelium',
    'minecraft:snow_block',
    'minecraft:terracotta',
    'minecraft:dirt'
];

/** Java's `CompositeDirection.Direction8`, in its declaration order. */
export type Direction8 =
    'north' | 'north_east' | 'east' | 'south_east' | 'south' | 'south_west' | 'west' | 'north_west';

/** Each {@link Direction8} with its chunk step, in Java's declaration order. */
export const DIRECTIONS_8: readonly {
    readonly direction: Direction8;
    readonly stepX: number;
    readonly stepZ: number;
}[] = [
    { direction: 'north', stepX: 0, stepZ: -1 },
    { direction: 'north_east', stepX: 1, stepZ: -1 },
    { direction: 'east', stepX: 1, stepZ: 0 },
    { direction: 'south_east', stepX: 1, stepZ: 1 },
    { direction: 'south', stepX: 0, stepZ: 1 },
    { direction: 'south_west', stepX: -1, stepZ: 1 },
    { direction: 'west', stepX: -1, stepZ: 0 },
    { direction: 'north_west', stepX: -1, stepZ: -1 }
];

/**
 * What a {@link BlendingData} reads out of the old chunk it describes.
 *
 * Coordinates are local to the chunk horizontally (0 to 15, or quart 0 to 3) and absolute
 * vertically. A position outside the chunk's stored range reads as air.
 */
export interface OldChunkView {
    /** Whether the block is one of {@link BLENDING_SURFACE_BLOCKS}. */
    isSurfaceBlock(x: number, y: number, z: number): boolean;
    /**
     * Java's `BlendingData.isGround`: a block with a collision shape that is not air, leaves, a log
     * or a mushroom block.
     */
    isGround(x: number, y: number, z: number): boolean;
    /** The Java biome id the chunk stores at a quart position. */
    noiseBiome(quartX: number, quartY: number, quartZ: number): string;
}

/** Java's `BlendingData.Packed`: the part of the record a chunk keeps on disk. */
export interface PackedBlendingData {
    /** The lowest section the old generation covers. */
    readonly minSection: number;
    /** One past the highest section the old generation covers. */
    readonly maxSection: number;
    /** The sixteen surface heights, when any was computed; {@link BLENDING_NO_VALUE} marks a gap. */
    readonly heights?: readonly number[];
}

/**
 * A computed record as plain data, so it can cross a worker boundary by structured clone.
 *
 * The typed arrays hold Java's `float` values exactly.
 */
export interface BlendingDataSnapshot {
    readonly minSection: number;
    readonly maxSection: number;
    readonly heights: Float32Array;
    readonly densities: readonly (Float32Array | null)[];
    readonly biomes: readonly (readonly string[] | null)[];
}

/** Java's `zeroIfNegative`. */
const zeroIfNegative = (value: number): number => (value < 0 ? 0 : value);

const insideIndex = (x: number, z: number): number => CELL_HORIZONTAL_MAX_INDEX_INSIDE - x + z;

const outsideIndex = (x: number, z: number): number =>
    CELL_COLUMN_INSIDE_COUNT + x + CELL_HORIZONTAL_MAX_INDEX_OUTSIDE - z;

const cellXOf = (index: number): number => {
    if (index < CELL_COLUMN_INSIDE_COUNT) return zeroIfNegative(CELL_HORIZONTAL_MAX_INDEX_INSIDE - index);
    const offset = index - CELL_COLUMN_INSIDE_COUNT;
    return CELL_HORIZONTAL_MAX_INDEX_OUTSIDE - zeroIfNegative(CELL_HORIZONTAL_MAX_INDEX_OUTSIDE - offset);
};

const cellZOf = (index: number): number => {
    if (index < CELL_COLUMN_INSIDE_COUNT) return zeroIfNegative(index - CELL_HORIZONTAL_MAX_INDEX_INSIDE);
    const offset = index - CELL_COLUMN_INSIDE_COUNT;
    return CELL_HORIZONTAL_MAX_INDEX_OUTSIDE - zeroIfNegative(offset - CELL_HORIZONTAL_MAX_INDEX_OUTSIDE);
};

/** One block down, then whether it is ground: Java's `read1`, as a float. */
const read1 = (view: OldChunkView, x: number, y: number, z: number): number => (view.isGround(x, y - 1, z) ? 1 : -1);

/**
 * The blending record of one old chunk.
 *
 * Built either from what the chunk stored ({@link BlendingData.unpack}) and then filled in with
 * {@link BlendingData.calculate}, or from a {@link BlendingDataSnapshot} another thread computed.
 */
export class BlendingData {
    /** The lowest block y the old generation covers. */
    public readonly minY: number;
    /** How many blocks tall the old generation is. */
    public readonly height: number;
    private readonly heights: Float32Array;
    private readonly densities: (Float32Array | null)[];
    private readonly biomes: (readonly string[] | null)[];
    private calculated: boolean;

    private constructor(
        public readonly minSection: number,
        public readonly maxSection: number,
        heights: Float32Array,
        densities: (Float32Array | null)[],
        biomes: (readonly string[] | null)[],
        calculated: boolean
    ) {
        this.minY = minSection * 16;
        this.height = (maxSection - minSection) * 16;
        this.heights = heights;
        this.densities = densities;
        this.biomes = biomes;
        this.calculated = calculated;
    }

    /**
     * Java's `BlendingData.unpack`: a record that has not read its chunk yet.
     *
     * @throws When `heights` is present with a length other than sixteen, Java's codec check.
     */
    public static unpack(packed: PackedBlendingData): BlendingData {
        const heights = new Float32Array(BLENDING_CELL_COLUMN_COUNT).fill(BLENDING_NO_VALUE);
        if (packed.heights !== undefined) {
            if (packed.heights.length !== BLENDING_CELL_COLUMN_COUNT) {
                throw new RangeError(`heights has to be of length ${BLENDING_CELL_COLUMN_COUNT}`);
            }
            heights.set(packed.heights);
        }
        return new BlendingData(
            packed.minSection,
            packed.maxSection,
            heights,
            new Array<Float32Array | null>(BLENDING_CELL_COLUMN_COUNT).fill(null),
            new Array<readonly string[] | null>(BLENDING_CELL_COLUMN_COUNT).fill(null),
            false
        );
    }

    /** Rebuilds a calculated record from {@link BlendingData.snapshot}. */
    public static fromSnapshot(snapshot: BlendingDataSnapshot): BlendingData {
        return new BlendingData(
            snapshot.minSection,
            snapshot.maxSection,
            snapshot.heights,
            [...snapshot.densities],
            [...snapshot.biomes],
            true
        );
    }

    /** The calculated record as cloneable data. */
    public snapshot(): BlendingDataSnapshot {
        return {
            minSection: this.minSection,
            maxSection: this.maxSection,
            heights: this.heights,
            densities: this.densities,
            biomes: this.biomes
        };
    }

    /** Java's `BlendingData.pack`: the area and, once any was computed, the heights. */
    public pack(): PackedBlendingData {
        const hasHeight = this.heights.some((height) => height !== BLENDING_NO_VALUE);
        return {
            minSection: this.minSection,
            maxSection: this.maxSection,
            ...(hasHeight ? { heights: Array.from(this.heights) } : {})
        };
    }

    /** The highest block y the old generation covers, Java's `getMaxY()`. */
    public get maxY(): number {
        return this.minY + this.height - 1;
    }

    /**
     * Java's `BlendingData.calculateData`: reads the edge columns that face a new chunk.
     *
     * It runs once; later calls keep the first result, as Java's `hasCalculatedData` does. A
     * height the chunk stored is kept rather than read again.
     *
     * @param view - The old chunk's blocks and biomes.
     * @param newSides - Which of the chunk's eight neighbors are new generation.
     */
    public calculate(view: OldChunkView, newSides: ReadonlySet<Direction8>): void {
        if (this.calculated) return;

        if (newSides.has('north') || newSides.has('west') || newSides.has('north_west')) {
            this.addValuesForColumn(insideIndex(0, 0), view, 0, 0);
        }

        if (newSides.has('north')) {
            for (let i = 1; i < QUARTS_PER_SECTION; i++) this.addValuesForColumn(insideIndex(i, 0), view, 4 * i, 0);
        }

        if (newSides.has('west')) {
            for (let i = 1; i < QUARTS_PER_SECTION; i++) this.addValuesForColumn(insideIndex(0, i), view, 0, 4 * i);
        }

        if (newSides.has('east')) {
            for (let i = 1; i < QUARTS_PER_SECTION; i++) {
                this.addValuesForColumn(outsideIndex(CELL_HORIZONTAL_MAX_INDEX_OUTSIDE, i), view, 15, 4 * i);
            }
        }

        if (newSides.has('south')) {
            for (let i = 0; i < QUARTS_PER_SECTION; i++) {
                this.addValuesForColumn(outsideIndex(i, CELL_HORIZONTAL_MAX_INDEX_OUTSIDE), view, 4 * i, 15);
            }
        }

        if (newSides.has('east') && newSides.has('north_east')) {
            this.addValuesForColumn(outsideIndex(CELL_HORIZONTAL_MAX_INDEX_OUTSIDE, 0), view, 15, 0);
        }

        if (newSides.has('east') && newSides.has('south') && newSides.has('south_east')) {
            this.addValuesForColumn(
                outsideIndex(CELL_HORIZONTAL_MAX_INDEX_OUTSIDE, CELL_HORIZONTAL_MAX_INDEX_OUTSIDE),
                view,
                15,
                15
            );
        }

        this.calculated = true;
    }

    private addValuesForColumn(index: number, view: OldChunkView, blockX: number, blockZ: number): void {
        if (this.heights[index] === BLENDING_NO_VALUE) this.heights[index] = this.heightAt(view, blockX, blockZ);

        this.densities[index] = this.densityColumn(view, blockX, blockZ, Math.floor(this.heights[index]!));
        this.biomes[index] = this.biomeColumn(view, blockX, blockZ);
    }

    /**
     * Java's `getHeightAtXZ` for a chunk with no primed `WORLD_SURFACE_WG` heightmap, which is
     * every finished chunk: the walk starts at the top of the old area.
     */
    private heightAt(view: OldChunkView, blockX: number, blockZ: number): number {
        for (let y = this.maxY; y > this.minY; y--) {
            if (view.isSurfaceBlock(blockX, y, blockZ)) return y;
        }
        return this.minY;
    }

    private densityColumn(view: OldChunkView, x: number, z: number, height: number): Float32Array {
        const densities = new Float32Array(this.cellCountPerColumn()).fill(-1);
        let y = this.maxY + 1;
        const read7 = (): number => {
            let sum = 0;
            for (let i = 0; i < 7; i++) {
                sum = f32(sum + read1(view, x, y, z));
                y--;
            }
            return sum;
        };

        let last7 = read7();
        for (let cellIndex = densities.length - 2; cellIndex >= 0; cellIndex--) {
            const one = read1(view, x, y, z);
            y--;
            const current7 = read7();
            densities[cellIndex] = f32(f32(f32(last7 + one) + current7) / 15);
            last7 = current7;
        }

        const highest = this.cellYIndex(floorDiv(height, 8));
        if (highest >= 0 && highest < densities.length - 1) {
            const inCellIndex = f32(f32(f32(height + 0.5) % 8) / 8);
            const amplitude = f32(f32(1 - inCellIndex) / inCellIndex);
            const max = f32(Math.max(amplitude, 1) * 0.25);
            densities[highest + 1] = f32(-amplitude / max);
            densities[highest] = f32(1 / max);
        }

        return densities;
    }

    private biomeColumn(view: OldChunkView, blockX: number, blockZ: number): string[] {
        const count = this.quartCountPerColumn();
        const minQuartY = this.minY >> 2;
        const biomes: string[] = [];
        for (let quartIndex = 0; quartIndex < count; quartIndex++) {
            biomes.push(view.noiseBiome(blockX >> 2, quartIndex + minQuartY, blockZ >> 2));
        }
        return biomes;
    }

    /**
     * Java's `getHeight`: the fixed surface height of a cell column on the chunk's edge, or
     * {@link BLENDING_NO_VALUE}.
     *
     * @param cellX - The cell x relative to the chunk's first cell, 0 to 4.
     * @param cellZ - The cell z relative to the chunk's first cell, 0 to 4.
     */
    public getHeight(cellX: number, _cellY: number, cellZ: number): number {
        if (cellX === CELL_HORIZONTAL_MAX_INDEX_OUTSIDE || cellZ === CELL_HORIZONTAL_MAX_INDEX_OUTSIDE) {
            return this.heights[outsideIndex(cellX, cellZ)]!;
        }
        return cellX !== 0 && cellZ !== 0 ? BLENDING_NO_VALUE : this.heights[insideIndex(cellX, cellZ)]!;
    }

    /**
     * Java's `getDensity`: the fixed density of an edge cell, scaled by 0.1, or
     * {@link BLENDING_NO_VALUE}. The cell just under the old area always reads as solid.
     */
    public getDensity(cellX: number, cellY: number, cellZ: number): number {
        if (cellY === this.cellMinY()) return BLENDING_DENSITY_FACTOR;
        if (cellX === CELL_HORIZONTAL_MAX_INDEX_OUTSIDE || cellZ === CELL_HORIZONTAL_MAX_INDEX_OUTSIDE) {
            return this.densityIn(this.densities[outsideIndex(cellX, cellZ)] ?? null, cellY);
        }
        return cellX !== 0 && cellZ !== 0
            ? BLENDING_NO_VALUE
            : this.densityIn(this.densities[insideIndex(cellX, cellZ)] ?? null, cellY);
    }

    private densityIn(column: Float32Array | null, cellY: number): number {
        if (column === null) return BLENDING_NO_VALUE;
        const yIndex = this.cellYIndex(cellY);
        return yIndex >= 0 && yIndex < column.length
            ? f32(column[yIndex]! * BLENDING_DENSITY_FACTOR)
            : BLENDING_NO_VALUE;
    }

    /**
     * Java's `iterateBiomes`: every stored biome at one quart y, with its absolute cell position.
     *
     * @param minCellX - The chunk's first cell x, `chunkX * 4`.
     * @param minCellZ - The chunk's first cell z, `chunkZ * 4`.
     */
    public iterateBiomes(
        minCellX: number,
        quartY: number,
        minCellZ: number,
        consume: (cellX: number, cellZ: number, biome: string) => void
    ): void {
        const minQuartY = this.minY >> 2;
        if (quartY < minQuartY || quartY > this.maxY >> 2) return;

        const quartIndex = quartY - minQuartY;
        for (let i = 0; i < this.biomes.length; i++) {
            const column = this.biomes[i];
            if (column === null || column === undefined) continue;
            const biome = column[quartIndex];
            if (biome !== undefined) consume(minCellX + cellXOf(i), minCellZ + cellZOf(i), biome);
        }
    }

    /** Java's `iterateHeights`: every known edge height with its absolute cell position. */
    public iterateHeights(
        minCellX: number,
        minCellZ: number,
        consume: (cellX: number, cellZ: number, height: number) => void
    ): void {
        for (let i = 0; i < this.heights.length; i++) {
            const height = this.heights[i]!;
            if (height !== BLENDING_NO_VALUE) consume(minCellX + cellXOf(i), minCellZ + cellZOf(i), height);
        }
    }

    /**
     * Java's `iterateDensities`: every edge density with a cell y in `[fromCellY, toCellY)`,
     * scaled by 0.1.
     */
    public iterateDensities(
        minCellX: number,
        minCellZ: number,
        fromCellY: number,
        toCellY: number,
        consume: (cellX: number, cellY: number, cellZ: number, density: number) => void
    ): void {
        const minCellY = this.columnMinY();
        const minYIndex = Math.max(0, fromCellY - minCellY);
        const maxYIndex = Math.min(this.cellCountPerColumn(), toCellY - minCellY);

        for (let i = 0; i < this.densities.length; i++) {
            const column = this.densities[i];
            if (column === null || column === undefined) continue;
            const cellX = minCellX + cellXOf(i);
            const cellZ = minCellZ + cellZOf(i);
            for (let yIndex = minYIndex; yIndex < maxYIndex; yIndex++) {
                consume(cellX, yIndex + minCellY, cellZ, f32(column[yIndex]! * BLENDING_DENSITY_FACTOR));
            }
        }
    }

    private cellCountPerColumn(): number {
        return (this.maxSection - this.minSection) * 2;
    }

    private quartCountPerColumn(): number {
        return (this.maxSection - this.minSection) * QUARTS_PER_SECTION;
    }

    private cellMinY(): number {
        return this.minSection * 2;
    }

    private columnMinY(): number {
        return this.cellMinY() + 1;
    }

    private cellYIndex(cellY: number): number {
        return cellY - this.columnMinY();
    }
}
