import type { BiomeClimateLookup } from '../biome/BiomeClimate';
import { shouldMeltFrozenOceanIcebergSlightly } from '../biome/BiomeClimate';
import { AIR, WATER } from '../chunk/FluidPicker';
import type { DensityFunctionNode } from '../density/DensityFunction';
import { SampleContext } from '../density/SampleContext';
import { f32, floor } from '../math';
import type { Noise } from '../noise/GradientNoise';
import type { PositionalRandomFactory, RandomSource } from '../random/RandomSource';
import type { RandomState } from '../RandomState';
import type { MaterialRuleNode } from './MaterialRule';
import type { LocalBiomes } from './MaterialRuleContext';
import { MaterialRuleContext } from './MaterialRuleContext';
import { compileMaterialRuleProgram, MaterialRuleInterpreter } from './MaterialRuleProgram';
import type { MaterialRuleProgram } from './MaterialRuleProgram';
import { NativeSurfacePass } from './nativeSurface';
import { NativeSurfaceLayout } from '@jsprismarine/native-worldgen';
import type { SurfaceChunk } from './SurfaceChunk';
import type { WorldGenerationContext } from './VerticalAnchor';
import { createWorldGenerationContext } from './VerticalAnchor';

/** The registry name the clay band generator keys its random by. */
export const CLAY_BANDS_SEED = 'minecraft:clay_bands';

/** How many terracotta bands a badlands column cycles through. */
const CLAY_BAND_COUNT = 192;

const TERRACOTTA = 'minecraft:terracotta';
const WHITE_TERRACOTTA = 'minecraft:white_terracotta';
const ORANGE_TERRACOTTA = 'minecraft:orange_terracotta';
const YELLOW_TERRACOTTA = 'minecraft:yellow_terracotta';
const BROWN_TERRACOTTA = 'minecraft:brown_terracotta';
const RED_TERRACOTTA = 'minecraft:red_terracotta';
const LIGHT_GRAY_TERRACOTTA = 'minecraft:light_gray_terracotta';
const PACKED_ICE = 'minecraft:packed_ice';
const SNOW_BLOCK = 'minecraft:snow_block';

const ERODED_BADLANDS = 'minecraft:eroded_badlands';
const FROZEN_OCEANS = new Set(['minecraft:frozen_ocean', 'minecraft:deep_frozen_ocean']);

/** The side length of a chunk column in blocks. */
const CHUNK_SIZE = 16;

/** Java's `RandomSource.nextIntBetweenInclusive`. */
const nextIntBetweenInclusive = (random: RandomSource, min: number, max: number): number =>
    random.nextIntBounded(max - min + 1) + min;

/** Builds the 192-entry terracotta band table a badlands column reads. */
const generateBands = (random: RandomSource): string[] => {
    const bands: string[] = new Array(CLAY_BAND_COUNT).fill(TERRACOTTA);
    for (let index = 0; index < bands.length; index++) {
        index += random.nextIntBounded(5) + 1;
        if (index < bands.length) bands[index] = ORANGE_TERRACOTTA;
    }

    makeBands(random, bands, 1, YELLOW_TERRACOTTA);
    makeBands(random, bands, 2, BROWN_TERRACOTTA);
    makeBands(random, bands, 1, RED_TERRACOTTA);

    const whiteBandCount = nextIntBetweenInclusive(random, 9, 15);
    let placed = 0;
    for (let start = 0; placed < whiteBandCount && start < bands.length; start += random.nextIntBounded(16) + 4) {
        bands[start] = WHITE_TERRACOTTA;
        if (start - 1 > 0 && random.nextBoolean()) bands[start - 1] = LIGHT_GRAY_TERRACOTTA;
        if (start + 1 < bands.length && random.nextBoolean()) bands[start + 1] = LIGHT_GRAY_TERRACOTTA;
        placed++;
    }
    return bands;
};

const makeBands = (random: RandomSource, bands: string[], baseWidth: number, state: string): void => {
    const bandCount = nextIntBetweenInclusive(random, 6, 15);
    for (let band = 0; band < bandCount; band++) {
        const width = baseWidth + random.nextIntBounded(3);
        const start = random.nextIntBounded(bands.length);
        for (let offset = 0; start + offset < bands.length && offset < width; offset++) {
            bands[start + offset] = state;
        }
    }
};

/**
 * What one chunk's finished surface pass can still answer.
 *
 * Java's `terrain` status runs the carvers after the surface materials are in, and a carver
 * that cuts through a grass block asks the material rule what the dirt it exposed should
 * become. The rule is bound once per chunk to one position context, so the answer comes from
 * the pass that bound it rather than from a second binding per carved block.
 *
 * Java builds a fresh context per call instead. The two agree because every cached answer in
 * the context is keyed by the update counters, which both `updateXZ` and `updateY` bump.
 */
export interface SurfacePass {
    /**
     * The material the rule puts at one position, both stone depth counters pinned to one.
     *
     * This is Java's `MaterialSystem.topMaterial`. The pinned counters make the rule answer
     * with the column's top material whatever shape the column has after a carver cut it, which
     * is the point: the real counters would describe the hole, not the ground.
     *
     * @param hasFluid - Whether the block above this one holds a fluid. It becomes the water
     *   height the `water` condition reads, so a flooded cave gets its underwater material.
     * @returns The block to place, or undefined when no rule matched the position.
     */
    topMaterial(blockX: number, blockY: number, blockZ: number, hasFluid: boolean): string | undefined;
    /**
     * How many blocks the native pass handed back to the TypeScript interpreter, because they
     * reached a condition only it answers; undefined where the whole pass ran in TypeScript.
     */
    readonly handedBack?: number;
}

/** What the surface pass needs besides the chunk it is building. */
export interface BuildSurfaceOptions {
    /** The chunk, already filled with terrain and fluids. */
    readonly chunk: SurfaceChunk;
    /** The rule tree, which `NoiseGeneratorSettings.materialRule` names. */
    readonly rule: MaterialRuleNode;
    /** The biome at a block position, which has to vary per column. */
    readonly biomeAt: (x: number, y: number, z: number) => string;
    /**
     * The unjittered biome of one cell, when `biomeAt` reads a `BiomeManager` over these
     * cells. It lets a `biome` condition answer for a block whose candidate cells all agree.
     */
    readonly biomeCellAt?: (quartX: number, quartY: number, quartZ: number) => string;
    /**
     * The seed of the jitter `biomeAt`'s `BiomeManager` applies, `BiomeManager.zoomSeed`. With it and
     * `biomeCellAt`, the pass runs in the native library where it loads.
     */
    readonly biomeZoomSeed?: bigint;
    /** False keeps the pass in TypeScript where the native library would run it. */
    readonly native?: boolean;
    /** The climate of a biome, which the `temperature` condition and icebergs read. */
    readonly biomeClimate: BiomeClimateLookup;
    /** The memo slots the compiled density functions share; one per chunk. */
    readonly sampleContext?: SampleContext;
    /** Every biome the chunk can hold, which lets a `biome` condition fold to a constant. */
    readonly possibleBiomes?: ReadonlySet<string>;
    /** The biomes of a box inside the chunk; see {@link LocalBiomes}. */
    readonly localBiomes?: LocalBiomes;
}

/**
 * The surface pass: the stage that turns a column of stone and water into grass, sand,
 * terracotta bands, bedrock and ore veins.
 *
 * It walks each column of a chunk downward, counts how far each solid block sits from the
 * opening above it and the opening below it, and asks the dimension's material rule tree what
 * to place. The three counters, the randomized surface depth and the preliminary surface
 * level are the whole input the rule tree sees beyond the block position and the biome.
 *
 * Two biomes extend the pass with code rather than with rules: eroded badlands grows stone
 * pillars above the terrain, and the two frozen oceans grow icebergs. Both run here, as they
 * do in Java.
 */
export class SurfaceSystem {
    /** The dimension's filler block, which the badlands extension stacks. */
    public readonly defaultBlock: string;
    /** The dimension's sea level. */
    public readonly seaLevel: number;
    /** The preliminary surface height function, which is the router's `chunk_surface_level`. */
    public readonly preliminarySurface: DensityFunctionNode;
    /** The dimension extent a vertical anchor resolves against. */
    public readonly generationContext: WorldGenerationContext;

    private readonly clayBands: readonly string[];
    private readonly clayBandsOffsetNoise: Noise;
    private readonly surfaceNoise: Noise;
    private readonly surfaceSecondaryNoise: Noise;
    private readonly badlandsPillarNoise: Noise;
    private readonly badlandsPillarRoofNoise: Noise;
    private readonly badlandsSurfaceNoise: Noise;
    private readonly icebergPillarNoise: Noise;
    private readonly icebergPillarRoofNoise: Noise;
    private readonly icebergSurfaceNoise: Noise;
    private readonly noiseRandom: PositionalRandomFactory;
    /** Each rule program's native pass, or null where it cannot run there. */
    private readonly nativePasses = new Map<
        MaterialRuleProgram,
        { readonly zoomSeed: bigint; readonly pass: NativeSurfacePass | null }
    >();

    public constructor(private readonly randomState: RandomState) {
        const settings = randomState.settings;
        this.defaultBlock = settings.defaultBlock;
        this.seaLevel = settings.seaLevel;
        this.preliminarySurface = settings.noiseRouter.chunkSurfaceLevel;
        this.generationContext = createWorldGenerationContext(settings);
        this.noiseRandom = randomState.random;

        this.clayBandsOffsetNoise = randomState.noise('minecraft:clay_bands_offset');
        this.clayBands = generateBands(this.noiseRandom.fromHashOf(CLAY_BANDS_SEED));
        this.surfaceNoise = randomState.noise('minecraft:surface');
        this.surfaceSecondaryNoise = randomState.noise('minecraft:surface_secondary');
        this.badlandsPillarNoise = randomState.noise('minecraft:badlands_pillar');
        this.badlandsPillarRoofNoise = randomState.noise('minecraft:badlands_pillar_roof');
        this.badlandsSurfaceNoise = randomState.noise('minecraft:badlands_surface');
        this.icebergPillarNoise = randomState.noise('minecraft:iceberg_pillar');
        this.icebergPillarRoofNoise = randomState.noise('minecraft:iceberg_pillar_roof');
        this.icebergSurfaceNoise = randomState.noise('minecraft:iceberg_surface');
    }

    /**
     * How thick the surface layer is in one column.
     *
     * The value is a noise sample plus one quarter of a positional random draw, so two
     * neighboring columns differ by a block or so and the grass line is not flat.
     */
    public getSurfaceDepth(blockX: number, blockZ: number): number {
        const noiseValue = this.surfaceNoise.get3(blockX, 0, blockZ);
        return Math.trunc(noiseValue * 2.75 + 3 + this.noiseRandom.at(blockX, 0, blockZ).nextDouble() * 0.25);
    }

    /** The second surface noise, which widens a `stone_depth` condition's secondary range. */
    public getSurfaceSecondary(blockX: number, blockZ: number): number {
        return this.surfaceSecondaryNoise.get3(blockX, 0, blockZ);
    }

    /** The terracotta band at one position of a badlands column. */
    public getBand(x: number, y: number, z: number): string {
        const offset = Math.round(f32(this.clayBandsOffsetNoise.get3(x, 0, z) * 4));
        return this.clayBands[(y + offset + this.clayBands.length) % this.clayBands.length] as string;
    }

    /**
     * Runs the material rule over every column of one chunk, writing into the chunk.
     *
     * Columns are walked from the top down, because the stone depth counters and the water
     * height the rules read are accumulated in that order.
     *
     * @returns The bound rule and its context, which the carvers query per carved block.
     */
    public buildSurface(options: BuildSurfaceOptions): SurfacePass {
        const chunk = options.chunk;
        const minBlockX = chunk.chunkX * CHUNK_SIZE;
        const minBlockZ = chunk.chunkZ * CHUNK_SIZE;
        const context = new MaterialRuleContext({
            system: this,
            randomState: this.randomState,
            biomeAt: options.biomeAt,
            biomeClimate: options.biomeClimate,
            generationContext: this.generationContext,
            sampleContext: options.sampleContext ?? new SampleContext(),
            ...(options.possibleBiomes === undefined ? {} : { possibleBiomes: options.possibleBiomes }),
            ...(options.localBiomes === undefined ? {} : { localBiomes: options.localBiomes }),
            ...(options.biomeCellAt === undefined ? {} : { biomeCellAt: options.biomeCellAt })
        });
        const program = compileMaterialRuleProgram(options.rule);
        const rule = new MaterialRuleInterpreter(program, context);
        const column = new Array<string>(chunk.maxY - chunk.minY + 1);

        const native = this.nativePass(options, program, context);
        let handedBack: number | undefined;
        if (native !== undefined && options.biomeCellAt !== undefined) {
            handedBack = this.buildSurfaceNatively(options, native, options.biomeCellAt, context, rule, column);
        } else {
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                    const blockX = minBlockX + localX;
                    const blockZ = minBlockZ + localZ;
                    const startingHeight = chunk.surfaceHeight(localX, localZ) + 1;
                    const surfaceBiome = options.biomeAt(blockX, startingHeight, blockZ);
                    if (surfaceBiome === ERODED_BADLANDS) {
                        this.erodedBadlandsExtension(chunk, blockX, blockZ, startingHeight);
                    }

                    context.updateXZ(
                        blockX,
                        blockZ,
                        this.surfaceGradientX(chunk, localX, localZ),
                        this.surfaceGradientZ(chunk, localX, localZ)
                    );
                    this.buildColumn(chunk, context, rule, column, blockX, blockZ, startingHeight);

                    if (FROZEN_OCEANS.has(surfaceBiome)) {
                        this.frozenOceanExtension(
                            chunk,
                            options.biomeClimate(surfaceBiome),
                            context.getMinSurfaceLevel(),
                            blockX,
                            blockZ,
                            startingHeight
                        );
                    }
                }
            }
        }

        return {
            ...(handedBack === undefined ? {} : { handedBack }),
            topMaterial: (blockX, blockY, blockZ, hasFluid) => {
                const localX = blockX & 15;
                const localZ = blockZ & 15;
                context.updateXZ(
                    blockX,
                    blockZ,
                    this.surfaceGradientX(chunk, localX, localZ),
                    this.surfaceGradientZ(chunk, localX, localZ)
                );
                // Java passes `Integer.MIN_VALUE` for "nothing above"; this pass spells the
                // same sentinel `-Infinity`, which is what the `water` condition tests for.
                context.updateY(1, 1, hasFluid ? blockY + 1 : Number.NEGATIVE_INFINITY, blockY);
                return rule.run(blockX, blockY, blockZ);
            }
        };
    }

    /**
     * The native pass for a program, made once per program and jitter seed; undefined where the
     * library does not load, the caller asked for TypeScript, cannot give the biome cells and the
     * jitter seed, or the context reads the cell walk's interpolation buffers.
     */
    private nativePass(
        options: BuildSurfaceOptions,
        program: MaterialRuleProgram,
        context: MaterialRuleContext
    ): NativeSurfacePass | undefined {
        const zoomSeed = options.biomeZoomSeed;
        if (options.native === false || options.biomeCellAt === undefined || zoomSeed === undefined) return undefined;
        // The C samples interpolated trees per block, as a context with its buffers off does.
        if (context.sampleContext.interpolationBuffersEnabled) return undefined;
        const cached = this.nativePasses.get(program);
        if (cached !== undefined && cached.zoomSeed === zoomSeed) return cached.pass ?? undefined;
        const pass = NativeSurfacePass.create(program, this.randomState, this.generationContext, zoomSeed);
        this.nativePasses.set(program, { zoomSeed, pass: pass ?? null });
        return pass;
    }

    /**
     * The pass over a whole chunk in the native library: each column's badlands pillars, records
     * and categories first, then one call for every column, then the blocks it hands back run on
     * the interpreter and the frozen ocean icebergs. Each column reads and writes only itself, so
     * the order across columns does not change a block.
     */
    private buildSurfaceNatively(
        options: BuildSurfaceOptions,
        native: NativeSurfacePass,
        biomeCellAt: (quartX: number, quartY: number, quartZ: number) => string,
        context: MaterialRuleContext,
        rule: MaterialRuleInterpreter,
        column: string[]
    ): number {
        const chunk = options.chunk;
        const minBlockX = chunk.chunkX * CHUNK_SIZE;
        const minBlockZ = chunk.chunkZ * CHUNK_SIZE;
        const height = chunk.maxY - chunk.minY + 1;
        const records = native.columnRecords();
        const blocks = native.blockCategories(height);
        const surfaceBiomes = new Array<string>(CHUNK_SIZE * CHUNK_SIZE);
        const minSurfaceLevels = new Float64Array(CHUNK_SIZE * CHUNK_SIZE);
        const fields = NativeSurfaceLayout.columnFields;

        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                const index = localX * CHUNK_SIZE + localZ;
                const blockX = minBlockX + localX;
                const blockZ = minBlockZ + localZ;
                const startingHeight = chunk.surfaceHeight(localX, localZ) + 1;
                const surfaceBiome = options.biomeAt(blockX, startingHeight, blockZ);
                surfaceBiomes[index] = surfaceBiome;
                if (surfaceBiome === ERODED_BADLANDS) {
                    this.erodedBadlandsExtension(chunk, blockX, blockZ, startingHeight);
                }
                const gradientX = this.surfaceGradientX(chunk, localX, localZ);
                const gradientZ = this.surfaceGradientZ(chunk, localX, localZ);
                context.updateXZ(blockX, blockZ, gradientX, gradientZ);
                const minSurfaceLevel = context.getMinSurfaceLevel();
                minSurfaceLevels[index] = minSurfaceLevel;
                const record = index * fields;
                records[record] = startingHeight;
                records[record + 1] = context.surfaceDepth;
                records[record + 2] = gradientX;
                records[record + 3] = gradientZ;
                records[record + 4] = minSurfaceLevel;
                records[record + 5] = context.getSurfaceSecondary();

                if (chunk.readColumn !== undefined) chunk.readColumn(localX, localZ, column);
                else
                    for (let y = chunk.minY; y <= chunk.maxY; y++)
                        column[y - chunk.minY] = chunk.getBlock(blockX, y, blockZ);
                const base = index * height;
                for (let y = 0; y < height; y++) blocks[base + y] = NativeSurfacePass.categoryOf(column[y]!);
            }
        }

        let topY = chunk.minY;
        for (let index = 0; index < CHUNK_SIZE * CHUNK_SIZE; index++) {
            topY = Math.max(topY, records[index * fields]!);
        }
        const result = native.run(
            chunk.chunkX,
            chunk.chunkZ,
            chunk.minY,
            height,
            topY,
            biomeCellAt,
            context.sampleContext
        );
        const { states, names } = result;
        for (let index = 0; index < CHUNK_SIZE * CHUNK_SIZE; index++) {
            const blockX = minBlockX + (index >> 4);
            const blockZ = minBlockZ + (index & 15);
            const base = index * height;
            for (let y = 0; y < height; y++) {
                const state = states[base + y]!;
                if (state >= 0) chunk.setBlock(blockX, chunk.minY + y, blockZ, names[state]!);
            }
        }

        // The blocks that reached a condition only the TypeScript answers, with their counters.
        const fallbacks = result.fallbacks;
        const fallbackFields = NativeSurfaceLayout.fallbackFields;
        let lastColumn = -1;
        for (let entry = 0; entry < result.fallbackCount; entry++) {
            const at = entry * fallbackFields;
            const block = fallbacks[at]!;
            const index = Math.floor(block / height);
            const localX = index >> 4;
            const localZ = index & 15;
            const blockX = minBlockX + localX;
            const blockZ = minBlockZ + localZ;
            const blockY = chunk.minY + (block % height);
            if (index !== lastColumn) {
                context.updateXZ(
                    blockX,
                    blockZ,
                    this.surfaceGradientX(chunk, localX, localZ),
                    this.surfaceGradientZ(chunk, localX, localZ)
                );
                lastColumn = index;
            }
            const waterHeight = fallbacks[at + 3]!;
            context.updateY(
                fallbacks[at + 1]!,
                fallbacks[at + 2]!,
                waterHeight === NativeSurfaceLayout.noWater ? Number.NEGATIVE_INFINITY : waterHeight,
                blockY
            );
            const state = rule.run(blockX, blockY, blockZ);
            if (state !== undefined) chunk.setBlock(blockX, blockY, blockZ, state);
        }

        for (let index = 0; index < CHUNK_SIZE * CHUNK_SIZE; index++) {
            const surfaceBiome = surfaceBiomes[index]!;
            if (!FROZEN_OCEANS.has(surfaceBiome)) continue;
            const localX = index >> 4;
            const localZ = index & 15;
            this.frozenOceanExtension(
                chunk,
                options.biomeClimate(surfaceBiome),
                minSurfaceLevels[index]!,
                minBlockX + localX,
                minBlockZ + localZ,
                chunk.surfaceHeight(localX, localZ) + 1
            );
        }
        return result.fallbackCount;
    }

    private buildColumn(
        chunk: SurfaceChunk,
        context: MaterialRuleContext,
        rule: MaterialRuleInterpreter,
        column: string[],
        blockX: number,
        blockZ: number,
        startingHeight: number
    ): void {
        let stoneAboveDepth = 0;
        let waterHeight = Number.NEGATIVE_INFINITY;
        let nextCeilingStoneY = Number.POSITIVE_INFINITY;
        const endY = chunk.minY;
        const maxY = chunk.maxY;

        // The walk writes only at the y it stands on and reads only there and below, so a copy
        // taken before it starts reads the same blocks as the chunk would.
        if (chunk.readColumn !== undefined) chunk.readColumn(blockX & 15, blockZ & 15, column);
        else for (let y = endY; y <= maxY; y++) column[y - endY] = chunk.getBlock(blockX, y, blockZ);
        const blockAt = (y: number): string => (y < endY || y > maxY ? AIR : (column[y - endY] as string));

        for (let y = startingHeight; y >= endY; y--) {
            const old = blockAt(y);
            if (old === AIR) {
                stoneAboveDepth = 0;
                waterHeight = Number.NEGATIVE_INFINITY;
                continue;
            }
            if (isFluid(old)) {
                if (waterHeight === Number.NEGATIVE_INFINITY) waterHeight = y + 1;
                continue;
            }

            if (nextCeilingStoneY >= y) {
                // Java's DimensionType.WAY_BELOW_MIN_Y, the sentinel for "no opening below".
                nextCeilingStoneY = -2048;
                for (let lookahead = y - 1; lookahead >= endY - 1; lookahead--) {
                    const next = blockAt(lookahead);
                    if (!isStone(next)) {
                        nextCeilingStoneY = lookahead + 1;
                        break;
                    }
                }
            }

            stoneAboveDepth++;
            context.updateY(stoneAboveDepth, y - nextCeilingStoneY + 1, waterHeight, y);
            if (y >= chunk.minY && y <= chunk.maxY) {
                const state = rule.run(blockX, y, blockZ);
                if (state !== undefined) chunk.setBlock(blockX, y, blockZ, state);
            }
        }
    }

    private surfaceGradientX(chunk: SurfaceChunk, localX: number, localZ: number): number {
        return (
            chunk.surfaceHeight(Math.min(localX + 1, 15), localZ) - chunk.surfaceHeight(Math.max(localX - 1, 0), localZ)
        );
    }

    private surfaceGradientZ(chunk: SurfaceChunk, localX: number, localZ: number): number {
        return (
            chunk.surfaceHeight(localX, Math.min(localZ + 1, 15)) - chunk.surfaceHeight(localX, Math.max(localZ - 1, 0))
        );
    }

    /** Grows the stone pillars that stand above an eroded badlands column. */
    private erodedBadlandsExtension(chunk: SurfaceChunk, blockX: number, blockZ: number, height: number): void {
        const pillarBuffer = Math.min(
            Math.abs(this.badlandsSurfaceNoise.get3(blockX, 0, blockZ) * 8.25),
            f32(this.badlandsPillarNoise.get3(blockX * 0.2, 0, blockZ * 0.2) * 15)
        );
        if (pillarBuffer <= 0) return;

        const pillarFloor = Math.abs(this.badlandsPillarRoofNoise.get3(blockX * 0.75, 0, blockZ * 0.75) * 1.5);
        const extensionTop = 64 + Math.min(pillarBuffer * pillarBuffer * 2.5, Math.ceil(pillarFloor * 50) + 24);
        const startY = floor(extensionTop);
        if (height > startY) return;

        for (let y = startY; y >= chunk.minY; y--) {
            const old = chunk.getBlock(blockX, y, blockZ);
            if (old === this.defaultBlock) break;
            if (old === WATER) return;
        }
        for (let y = startY; y >= chunk.minY && chunk.getBlock(blockX, y, blockZ) === AIR; y--) {
            chunk.setBlock(blockX, y, blockZ, this.defaultBlock);
        }
    }

    /** Grows the packed ice and snow of a frozen ocean iceberg. */
    private frozenOceanExtension(
        chunk: SurfaceChunk,
        climate: Parameters<typeof shouldMeltFrozenOceanIcebergSlightly>[0],
        minSurfaceLevel: number,
        blockX: number,
        blockZ: number,
        height: number
    ): void {
        const iceberg = Math.min(
            Math.abs(this.icebergSurfaceNoise.get3(blockX, 0, blockZ) * 8.25),
            f32(this.icebergPillarNoise.get3(blockX * 1.28, 0, blockZ * 1.28) * 15)
        );
        if (iceberg <= 1.8) return;

        const icebergRoof = Math.abs(this.icebergPillarRoofNoise.get3(blockX * 1.17, 0, blockZ * 1.17) * 1.5);
        let top = Math.min(iceberg * iceberg * 1.2, Math.ceil(icebergRoof * 40) + 14);
        if (shouldMeltFrozenOceanIcebergSlightly(climate, blockX, this.seaLevel, blockZ, this.seaLevel)) top -= 2;
        if (top <= 2) return;

        const extensionBottom = this.seaLevel - top - 7;
        top += this.seaLevel;
        const extensionTop = top;
        const random = this.noiseRandom.at(blockX, 0, blockZ);
        const maxSnowDepth = 2 + random.nextIntBounded(4);
        const minSnowHeight = this.seaLevel + 18 + random.nextIntBounded(10);
        let snowDepth = 0;

        for (let y = Math.max(height, Math.trunc(top) + 1); y >= minSurfaceLevel; y--) {
            // Java writes these as one short-circuiting `||`, so the second draw only happens
            // when the first test fails. Evaluating both would shift every later draw.
            const block = chunk.getBlock(blockX, y, blockZ);
            const fits =
                (block === AIR && y < Math.trunc(extensionTop) && random.nextDouble() > 0.01) ||
                (block === WATER && y > Math.trunc(extensionBottom) && y < this.seaLevel && random.nextDouble() > 0.15);
            if (!fits) continue;
            if (snowDepth <= maxSnowDepth && y > minSnowHeight) {
                chunk.setBlock(blockX, y, blockZ, SNOW_BLOCK);
                snowDepth++;
            } else {
                chunk.setBlock(blockX, y, blockZ, PACKED_ICE);
            }
        }
    }
}

/** Whether a block state is one of the two fluids the terrain pass can leave in a column. */
const isFluid = (state: string): boolean => state === WATER || state === 'minecraft:lava';

/** Whether a block state counts toward the stone depth counters. */
const isStone = (state: string): boolean => state !== AIR && !isFluid(state);
