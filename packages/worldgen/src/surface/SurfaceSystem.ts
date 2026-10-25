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
import type { RuleEvaluator } from './MaterialRuleContext';
import { compileMaterialRule, MaterialRuleContext } from './MaterialRuleContext';
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

/** What the surface pass needs besides the chunk it is building. */
export interface BuildSurfaceOptions {
    /** The chunk, already filled with terrain and fluids. */
    readonly chunk: SurfaceChunk;
    /** The rule tree, which `NoiseGeneratorSettings.materialRule` names. */
    readonly rule: MaterialRuleNode;
    /** The biome at a block position, which has to vary per column. */
    readonly biomeAt: (x: number, y: number, z: number) => string;
    /** The climate of a biome, which the `temperature` condition and icebergs read. */
    readonly biomeClimate: BiomeClimateLookup;
    /** The memo slots the compiled density functions share; one per chunk. */
    readonly sampleContext?: SampleContext;
    /** Every biome the chunk can hold, which lets a `biome` condition fold to a constant. */
    readonly possibleBiomes?: ReadonlySet<string>;
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
     */
    public buildSurface(options: BuildSurfaceOptions): void {
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
            ...(options.possibleBiomes === undefined ? {} : { possibleBiomes: options.possibleBiomes })
        });
        const rule = compileMaterialRule(options.rule, context);

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
                this.buildColumn(chunk, context, rule, blockX, blockZ, startingHeight);

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

    private buildColumn(
        chunk: SurfaceChunk,
        context: MaterialRuleContext,
        rule: RuleEvaluator,
        blockX: number,
        blockZ: number,
        startingHeight: number
    ): void {
        let stoneAboveDepth = 0;
        let waterHeight = Number.NEGATIVE_INFINITY;
        let nextCeilingStoneY = Number.POSITIVE_INFINITY;
        const endY = chunk.minY;

        for (let y = startingHeight; y >= endY; y--) {
            const old = chunk.getBlock(blockX, y, blockZ);
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
                    const next = chunk.getBlock(blockX, lookahead, blockZ);
                    if (!isStone(next)) {
                        nextCeilingStoneY = lookahead + 1;
                        break;
                    }
                }
            }

            stoneAboveDepth++;
            context.updateY(stoneAboveDepth, y - nextCeilingStoneY + 1, waterHeight, y);
            if (y >= chunk.minY && y <= chunk.maxY) {
                const state = rule(blockX, y, blockZ);
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
