import type { BiomeClimateLookup } from '../biome/BiomeClimate';
import { coldEnoughToSnow } from '../biome/BiomeClimate';
import { BiomeManager } from '../biome/BiomeManager';
import type { OreVeinCellBound } from '../chunk/oreVein';
import type { DensitySampler } from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import { SampleContext } from '../density/SampleContext';
import { floor } from '../math';
import type { Noise } from '../noise/GradientNoise';
import type { PositionalRandomFactory } from '../random/RandomSource';
import type { RandomState } from '../RandomState';
import type { SurfaceSystem } from './SurfaceSystem';
import type { WorldGenerationContext } from './VerticalAnchor';
import { resolveAnchorY } from './VerticalAnchor';

/** How far below the preliminary surface the surface pass still runs. */
const HOW_FAR_BELOW_PRELIMINARY_SURFACE_LEVEL_TO_BUILD_SURFACE = 8;

/**
 * The biomes the blocks inside a box can resolve to: a box whose blocks look up their biome only
 * in cells this set was read from.
 */
export interface LocalBiomes {
    /** Every biome of the cells the box's blocks read. */
    readonly biomes: ReadonlySet<string>;
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly minZ: number;
    readonly maxZ: number;
}

/** What a {@link MaterialRuleContext} needs besides the world seed. */
export interface MaterialRuleContextOptions {
    /** The surface system that owns the noises and the clay bands. */
    readonly system: SurfaceSystem;
    /** The seeded noises, randoms and compiled density functions. */
    readonly randomState: RandomState;
    /** The biome at a block position, which a `biome` condition reads per column. */
    readonly biomeAt: (x: number, y: number, z: number) => string;
    /**
     * The unjittered biome of one cell of the resolver `biomeAt` reads through a
     * {@link BiomeManager}. A `biome` condition then answers for every block whose eight candidate
     * cells agree, without the block's own lookup.
     */
    readonly biomeCellAt?: (quartX: number, quartY: number, quartZ: number) => string;
    /** The climate of a biome, which a `temperature` condition reads. */
    readonly biomeClimate: BiomeClimateLookup;
    /** The dimension extent a vertical anchor resolves against. */
    readonly generationContext: WorldGenerationContext;
    /** The memo slots the compiled density functions share; one per chunk. */
    readonly sampleContext?: SampleContext;
    /** Every biome the chunk can hold, which lets a `biome` condition fold to a constant. */
    readonly possibleBiomes?: ReadonlySet<string>;
    /**
     * The biomes of a box inside the chunk, which lets a `biome` condition answer without a
     * lookup for the blocks in the box.
     */
    readonly localBiomes?: LocalBiomes;
}

/**
 * The position a material rule program is looking at, and everything it can ask about that
 * position.
 *
 * The surface pass walks a column downward and updates the context in two steps: once per
 * column through {@link updateXZ} and once per block through {@link updateY}. Conditions that
 * only depend on the column cache their answer against the first counter and conditions that
 * depend on the block cache against the second, which is why one chunk evaluates the surface
 * noise 256 times instead of 98304 times.
 */
export class MaterialRuleContext {
    /** The x coordinate of the column being built. */
    public blockX = 0;
    /** The z coordinate of the column being built. */
    public blockZ = 0;
    /** How much the terrain height changes across the column in x. */
    public surfaceGradientX = 0;
    /** How much the terrain height changes across the column in z. */
    public surfaceGradientZ = 0;
    /** The randomized thickness of the column's surface layer. */
    public surfaceDepth = 0;
    /** The y coordinate of the block being built. */
    public blockY = 0;
    /** The y of the first block above the fluid covering this position, or `-Infinity`. */
    public waterHeight = Number.NEGATIVE_INFINITY;
    /** How many solid blocks sit between this one and the air above it, counting this one. */
    public stoneDepthAbove = 0;
    /** How many solid blocks sit between this one and the opening below it, counting this one. */
    public stoneDepthBelow = 0;
    /** Counts {@link updateXZ} calls, which the per-column caches compare against. */
    public updateCountXZ = 0;
    /** Counts {@link updateXZ} and {@link updateY} calls, which the per-block caches use. */
    public updateCountY = 0;
    /** Counts the times {@link getCandidateBiomes} moved to another parent cell. */
    public candidateCount = 0;

    /** Every biome the chunk can hold, or undefined when the caller did not narrow it. */
    public readonly possibleBiomes: ReadonlySet<string> | undefined;
    /** The biomes of a box inside the chunk, or undefined when the caller has none. */
    public readonly localBiomes: LocalBiomes | undefined;
    /** The dimension extent a vertical anchor resolves against. */
    public readonly generationContext: WorldGenerationContext;
    /** The memo slots the compiled density functions share. */
    public readonly sampleContext: SampleContext;

    private readonly system: SurfaceSystem;
    private readonly randomState: RandomState;
    private readonly biomeAt: (x: number, y: number, z: number) => string;
    private readonly biomeCellAt: ((quartX: number, quartY: number, quartZ: number) => string) | undefined;
    private readonly candidateBiomes: string[] = [];
    private candidateParentX = 0;
    private candidateParentY = 0;
    private candidateParentZ = 0;
    private readonly biomeClimateLookup: BiomeClimateLookup;
    private readonly noises2d = new Map<string, Noise>();
    private readonly noises3d = new Map<string, Noise>();
    private biome: string | undefined;
    private surfaceSecondary = 0;
    private lastSurfaceSecondaryUpdate = -1;
    private minSurfaceLevel = 0;
    private lastMinSurfaceLevelUpdate = -1;
    private readonly preliminarySurface: DensitySampler;

    public constructor(options: MaterialRuleContextOptions) {
        this.system = options.system;
        this.randomState = options.randomState;
        this.biomeAt = options.biomeAt;
        this.biomeCellAt = options.biomeCellAt;
        this.biomeClimateLookup = options.biomeClimate;
        this.generationContext = options.generationContext;
        this.sampleContext = options.sampleContext ?? new SampleContext();
        this.possibleBiomes = options.possibleBiomes;
        this.localBiomes = options.localBiomes;
        this.preliminarySurface = options.randomState.densitySampler(options.system.preliminarySurface);
    }

    /** Moves the context to a new column and recomputes its surface depth. */
    public updateXZ(blockX: number, blockZ: number, surfaceGradientX: number, surfaceGradientZ: number): void {
        this.updateCountXZ++;
        this.updateCountY++;
        this.blockX = blockX;
        this.blockZ = blockZ;
        this.surfaceGradientX = surfaceGradientX;
        this.surfaceGradientZ = surfaceGradientZ;
        this.surfaceDepth = this.system.getSurfaceDepth(blockX, blockZ);
    }

    /** Moves the context to a new block of the current column. */
    public updateY(stoneDepthAbove: number, stoneDepthBelow: number, waterHeight: number, blockY: number): void {
        this.updateCountY++;
        this.biome = undefined;
        this.blockY = blockY;
        this.waterHeight = waterHeight;
        this.stoneDepthBelow = stoneDepthBelow;
        this.stoneDepthAbove = stoneDepthAbove;
    }

    /** The dimension's sea level. */
    public get seaLevel(): number {
        return this.system.seaLevel;
    }

    /** The biome at the current position, looked up once per block. */
    public getBiome(): string {
        this.biome ??= this.biomeAt(this.blockX, this.blockY, this.blockZ);
        return this.biome;
    }

    /**
     * The biomes of the eight cells the current block's lookup picks among, or undefined when the
     * context has no `biomeCellAt`. They change only when the block moves into another parent
     * cell, which {@link candidateCount} counts, and a column walk crosses one every four blocks.
     */
    public getCandidateBiomes(): readonly string[] | undefined {
        const cellAt = this.biomeCellAt;
        if (cellAt === undefined) return undefined;
        const parentX = BiomeManager.parentCell(this.blockX);
        const parentY = BiomeManager.parentCell(this.blockY);
        const parentZ = BiomeManager.parentCell(this.blockZ);
        if (
            this.candidateCount === 0 ||
            parentX !== this.candidateParentX ||
            parentY !== this.candidateParentY ||
            parentZ !== this.candidateParentZ
        ) {
            this.candidateParentX = parentX;
            this.candidateParentY = parentY;
            this.candidateParentZ = parentZ;
            this.candidateCount++;
            for (let corner = 0; corner < 8; corner++) {
                this.candidateBiomes[corner] = cellAt(
                    (corner & 4) === 0 ? parentX : parentX + 1,
                    (corner & 2) === 0 ? parentY : parentY + 1,
                    (corner & 1) === 0 ? parentZ : parentZ + 1
                );
            }
        }
        return this.candidateBiomes;
    }

    /** The secondary surface noise of the current column, sampled once per column. */
    public getSurfaceSecondary(): number {
        if (this.lastSurfaceSecondaryUpdate !== this.updateCountXZ) {
            this.lastSurfaceSecondaryUpdate = this.updateCountXZ;
            this.surfaceSecondary = this.system.getSurfaceSecondary(this.blockX, this.blockZ);
        }
        return this.surfaceSecondary;
    }

    /**
     * The lowest y the surface pass treats as "near the surface", sampled once per column.
     *
     * This is the preliminary surface the terrain router predicted, raised by the column's
     * surface depth and lowered by eight blocks of slack.
     */
    public getMinSurfaceLevel(): number {
        if (this.lastMinSurfaceLevelUpdate !== this.updateCountXZ) {
            this.lastMinSurfaceLevelUpdate = this.updateCountXZ;
            const level = this.preliminarySurface(this.sampleContext, this.blockX, 0, this.blockZ);
            this.minSurfaceLevel =
                floor(level) + this.surfaceDepth - HOW_FAR_BELOW_PRELIMINARY_SURFACE_LEVEL_TO_BUILD_SURFACE;
        }
        return this.minSurfaceLevel;
    }

    /** Whether the current position is cold enough for snow, which needs the biome's climate. */
    public isColdEnoughToSnow(): boolean {
        return coldEnoughToSnow(
            this.biomeClimateLookup(this.getBiome()),
            this.blockX,
            this.blockY,
            this.blockZ,
            this.seaLevel
        );
    }

    /** Samples a named noise at the current column or the current block. */
    public sampleNoise(id: string, is3d: boolean): number {
        const cache = is3d ? this.noises3d : this.noises2d;
        let noise = cache.get(id);
        if (!noise) {
            noise = this.randomState.noise(id);
            cache.set(id, noise);
        }
        return is3d ? noise.get3(this.blockX, this.blockY, this.blockZ) : noise.get3(this.blockX, 0, this.blockZ);
    }

    /** The positional random factory a named rule draws from. */
    public randomFactory(name: string): PositionalRandomFactory {
        return this.randomState.randomFactory(name);
    }

    /** Compiles a density function against this world's seed. */
    public densitySampler(node: DensityFunctionNode): DensitySampler {
        return this.randomState.densitySampler(node);
    }

    /**
     * What an ore vein placer needs to rule out a cell of blocks at once, or undefined when the
     * tree has no `interpolated` node to size the cell by.
     */
    public densityCellBound(node: DensityFunctionNode): OreVeinCellBound | undefined {
        const cell = this.randomState.interpolationCellSizeOf(node);
        return cell === undefined ? undefined : { density: this.randomState.boundSampler(node), cell };
    }

    /** Resolves a vertical anchor against the dimension extent. */
    public resolveAnchorY(anchor: Parameters<typeof resolveAnchorY>[0]): number {
        return resolveAnchorY(anchor, this.generationContext);
    }

    /** The terracotta band of a badlands column at one position. */
    public getBand(x: number, y: number, z: number): string {
        return this.system.getBand(x, y, z);
    }
}
