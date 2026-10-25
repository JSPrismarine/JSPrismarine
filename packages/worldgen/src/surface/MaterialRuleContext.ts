import type { BiomeClimateLookup } from '../biome/BiomeClimate';
import { coldEnoughToSnow } from '../biome/BiomeClimate';
import { compileOreVeinRule, ORE_VEIN_SEED } from '../chunk/oreVein';
import type { DensitySampler } from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import { SampleContext } from '../density/SampleContext';
import { floor, map } from '../math';
import type { Noise } from '../noise/GradientNoise';
import type { PositionalRandomFactory } from '../random/RandomSource';
import type { RandomState } from '../RandomState';
import type { MaterialConditionNode, MaterialRuleNode } from './MaterialRule';
import type { SurfaceSystem } from './SurfaceSystem';
import type { WorldGenerationContext } from './VerticalAnchor';
import { resolveAnchorY } from './VerticalAnchor';

/** How far below the preliminary surface the surface pass still runs. */
const HOW_FAR_BELOW_PRELIMINARY_SURFACE_LEVEL_TO_BUILD_SURFACE = 8;

/** Returns the block a rule places at a position, or undefined to leave the position alone. */
export type RuleEvaluator = (x: number, y: number, z: number) => string | undefined;

/** Returns whether a condition holds at the context's current position. */
export type ConditionEvaluator = () => boolean;

/** What a {@link MaterialRuleContext} needs besides the world seed. */
export interface MaterialRuleContextOptions {
    /** The surface system that owns the noises and the clay bands. */
    readonly system: SurfaceSystem;
    /** The seeded noises, randoms and compiled density functions. */
    readonly randomState: RandomState;
    /** The biome at a block position, which a `biome` condition reads per column. */
    readonly biomeAt: (x: number, y: number, z: number) => string;
    /** The climate of a biome, which a `temperature` condition reads. */
    readonly biomeClimate: BiomeClimateLookup;
    /** The dimension extent a vertical anchor resolves against. */
    readonly generationContext: WorldGenerationContext;
    /** The memo slots the compiled density functions share; one per chunk. */
    readonly sampleContext?: SampleContext;
    /** Every biome the chunk can hold, which lets a `biome` condition fold to a constant. */
    readonly possibleBiomes?: ReadonlySet<string>;
}

/**
 * The position a compiled material rule is looking at, and everything it can ask about that
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

    /** Every biome the chunk can hold, or undefined when the caller did not narrow it. */
    public readonly possibleBiomes: ReadonlySet<string> | undefined;
    /** The dimension extent a vertical anchor resolves against. */
    public readonly generationContext: WorldGenerationContext;
    /** The memo slots the compiled density functions share. */
    public readonly sampleContext: SampleContext;

    private readonly system: SurfaceSystem;
    private readonly randomState: RandomState;
    private readonly biomeAt: (x: number, y: number, z: number) => string;
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
        this.biomeClimateLookup = options.biomeClimate;
        this.generationContext = options.generationContext;
        this.sampleContext = options.sampleContext ?? new SampleContext();
        this.possibleBiomes = options.possibleBiomes;
        this.preliminarySurface = options.randomState.sampler(options.system.preliminarySurface);
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
        return this.randomState.sampler(node);
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

/** Caches a per-column answer against the context's column counter. */
const lazyXZ = (context: MaterialRuleContext, compute: () => boolean): ConditionEvaluator => {
    let lastUpdate = -1;
    let result = false;
    return () => {
        if (lastUpdate !== context.updateCountXZ) {
            lastUpdate = context.updateCountXZ;
            result = compute();
        }
        return result;
    };
};

/** Caches a per-block answer against the context's block counter. */
const lazyY = (context: MaterialRuleContext, compute: () => boolean): ConditionEvaluator => {
    let lastUpdate = -1;
    let result = false;
    return () => {
        if (lastUpdate !== context.updateCountY) {
            lastUpdate = context.updateCountY;
            result = compute();
        }
        return result;
    };
};

/** Caches a per-column noise sample the same way Java's lazy noise suppliers do. */
const noiseSupplier = (context: MaterialRuleContext, id: string, is3d: boolean): (() => number) => {
    let lastUpdate = -1;
    let value = 0;
    return () => {
        const counter = is3d ? context.updateCountY : context.updateCountXZ;
        if (lastUpdate !== counter) {
            lastUpdate = counter;
            value = context.sampleNoise(id, is3d);
        }
        return value;
    };
};

/**
 * Compiles a material condition into a closure bound to one context.
 *
 * @throws Never at sample time; an unknown type is rejected while parsing.
 */
export const compileMaterialCondition = (
    node: MaterialConditionNode,
    context: MaterialRuleContext
): ConditionEvaluator => {
    switch (node.type) {
        case 'biome': {
            const biomes = new Set(node.biomes);
            const possible = context.possibleBiomes;
            if (possible) {
                let anyPossible = false;
                let allPossible = true;
                for (const biome of possible) {
                    if (biomes.has(biome)) anyPossible = true;
                    else allPossible = false;
                }
                if (!anyPossible) return () => false;
                if (allPossible) return () => true;
            }
            return lazyY(context, () => biomes.has(context.getBiome()));
        }
        case 'noise_threshold': {
            const sample = noiseSupplier(context, node.noise, node.is3d);
            return () => {
                const value = sample();
                return value >= node.minThreshold && value <= node.maxThreshold;
            };
        }
        case 'vertical_gradient': {
            const trueAtAndBelow = context.resolveAnchorY(node.trueAtAndBelow);
            const falseAtAndAbove = context.resolveAnchorY(node.falseAtAndAbove);
            const randomFactory = context.randomFactory(node.randomName);
            return lazyY(context, () => {
                const blockY = context.blockY;
                if (blockY <= trueAtAndBelow) return true;
                if (blockY >= falseAtAndAbove) return false;
                const probability = map(blockY, trueAtAndBelow, falseAtAndAbove, 1, 0);
                return randomFactory.at(context.blockX, blockY, context.blockZ).nextFloat() < probability;
            });
        }
        case 'y_above': {
            const anchor = node.anchor;
            return lazyY(
                context,
                () =>
                    context.blockY + (node.addStoneDepth ? context.stoneDepthAbove : 0) >=
                    context.resolveAnchorY(anchor) + context.surfaceDepth * node.surfaceDepthMultiplier
            );
        }
        case 'water':
            return lazyY(
                context,
                () =>
                    context.waterHeight === Number.NEGATIVE_INFINITY ||
                    context.blockY + (node.addStoneDepth ? context.stoneDepthAbove : 0) >=
                        context.waterHeight + node.offset + context.surfaceDepth * node.surfaceDepthMultiplier
            );
        case 'temperature':
            return () => context.isColdEnoughToSnow();
        case 'steep':
            return lazyXZ(context, () => context.surfaceGradientX <= -4 || context.surfaceGradientZ >= 4);
        case 'not': {
            const target = compileMaterialCondition(node.invert, context);
            return () => !target();
        }
        case 'hole':
            return lazyXZ(context, () => context.surfaceDepth <= 0);
        case 'above_preliminary_surface':
            return () => context.blockY >= context.getMinSurfaceLevel();
        case 'stone_depth': {
            const ceiling = node.surfaceType === 'ceiling';
            return lazyY(context, () => {
                const stoneDepth = ceiling ? context.stoneDepthBelow : context.stoneDepthAbove;
                const surfaceDepth = node.addSurfaceDepth ? context.surfaceDepth : 0;
                const secondary =
                    node.secondaryDepthRange === 0
                        ? 0
                        : Math.trunc(map(context.getSurfaceSecondary(), -1, 1, 0, node.secondaryDepthRange));
                return stoneDepth <= 1 + node.offset + surfaceDepth + secondary;
            });
        }
    }
};

/**
 * Compiles a material rule tree into a closure bound to one context.
 *
 * The tree is walked once here, so a whole chunk's surface pass is a chain of closures over
 * the context rather than a repeated switch over the node types.
 */
export const compileMaterialRule = (node: MaterialRuleNode, context: MaterialRuleContext): RuleEvaluator => {
    switch (node.type) {
        case 'block': {
            const state = node.resultState;
            return () => state;
        }
        case 'bandlands':
            return (x, y, z) => context.getBand(x, y, z);
        case 'sequence': {
            if (node.sequence.length === 1) {
                return compileMaterialRule(node.sequence[0] as MaterialRuleNode, context);
            }
            const sequence = node.sequence.map((child) => compileMaterialRule(child, context));
            return (x, y, z) => {
                for (const rule of sequence) {
                    const state = rule(x, y, z);
                    if (state !== undefined) return state;
                }
                return undefined;
            };
        }
        case 'condition': {
            const ifTrue = compileMaterialCondition(node.ifTrue, context);
            const thenRun = compileMaterialRule(node.thenRun, context);
            return (x, y, z) => (ifTrue() ? thenRun(x, y, z) : undefined);
        }
        case 'ore_vein': {
            const place = compileOreVeinRule(
                node.rule,
                (child) => context.densitySampler(child),
                context.randomFactory(ORE_VEIN_SEED)
            );
            return (x, y, z) => place(context.sampleContext, x, y, z);
        }
    }
};
