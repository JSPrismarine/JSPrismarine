import type {
    DensityBoundSampler,
    DensityBox,
    DensityRange,
    DensitySampler,
    InterpolationCellSize
} from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import type { SampleContext } from '../density/SampleContext';
import { normalizeIdentifier } from '../identifier';
import type { PositionalRandomFactory } from '../random/RandomSource';
import { asObject } from '../json';
import { floorDiv } from '../math';
import { WorldgenErrors } from '@jsprismarine/errors/worldgen';

/** The registry name the ore vein random factory is keyed by. */
export const ORE_VEIN_SEED = 'minecraft:ore';

/** One `minecraft:ore_vein` material rule, parsed. */
export interface OreVeinRule {
    /** The Java block state identifier placed for an ordinary vein block. */
    readonly oreBlock: string;
    /** The Java block state identifier placed for the rarer raw block. */
    readonly rawOreBlock: string;
    /** The Java block state identifier that fills the vein around the ore. */
    readonly fillerBlock: string;
    /** The chance an ore block becomes the raw block instead. */
    readonly rawOreChance: number;
    /** How strongly a vein claims a position; values at or below zero place nothing. */
    readonly density: DensityFunctionNode;
    /** How much of a claimed position is ore rather than filler. */
    readonly richness: DensityFunctionNode;
    /** Negative values punch holes of plain stone through a vein. */
    readonly fillerGap: DensityFunctionNode;
}

/**
 * Reads one `minecraft:ore_vein` material rule.
 *
 * 1.21 drove ore veins from three noise router slots named `vein_toggle`, `vein_ridged` and
 * `vein_gap`; 26.3 moved them into this rule, which the surface pass evaluates. The density
 * functions themselves still live in `worldgen/density_function/overworld/ore_vein/`.
 *
 * @param resolve - Looks up a referenced density function by identifier.
 * @throws When a field is missing or has the wrong shape.
 */
export const parseOreVeinRule = (
    source: unknown,
    resolve: (reference: unknown, path: string) => DensityFunctionNode,
    path = '<ore_vein>'
): OreVeinRule => {
    const raw = asObject(source, path);
    const chance = raw['raw_ore_chance'];
    if (typeof chance !== 'number' || !Number.isFinite(chance)) {
        throw new WorldgenErrors.InvalidRawOreChance({ path });
    }
    return {
        oreBlock: normalizeIdentifier(raw['ore_block']),
        rawOreBlock: normalizeIdentifier(raw['raw_ore_block']),
        fillerBlock: normalizeIdentifier(raw['filler_block']),
        rawOreChance: chance,
        density: resolve(raw['density'], `${path}.density`),
        richness: resolve(raw['richness'], `${path}.richness`),
        fillerGap: resolve(raw['filler_gap'], `${path}.filler_gap`)
    };
};

/** Returns the block an ore vein places at a position, or undefined to leave it alone. */
export type OreVeinPlacer = (context: SampleContext, x: number, y: number, z: number) => string | undefined;

/** How a placer can rule out a whole cell of blocks before it samples any of them. */
export interface OreVeinCellBound {
    /** Bounds the rule's `density` over a box, as `DensityFunctionCompiler.boundSampler` does. */
    readonly density: DensityBoundSampler;
    /** The box size, which sits inside one cell of every `interpolated` node `density` reaches. */
    readonly cell: InterpolationCellSize;
}

/**
 * How many cells a placer remembers a verdict for, direct-mapped by 4 cells across x and z and
 * 64 up y. That holds a whole chunk at vanilla's 4 by 8 cell, 4 by 4 by 48 cells, which matters
 * because the surface pass walks each of a cell's sixteen columns from the top down.
 */
const VERDICT_SLOTS = 4 * 4 * 64;
const UNKNOWN = 0;
const BARREN = 1;
const MAYBE = 2;

/**
 * Compiles an ore vein rule into a placer.
 *
 * The three random draws happen in Java's order: one against the vein density, one against
 * the richness, and one against the raw-ore chance. Reordering them changes which blocks the
 * same seed produces even though the distribution stays the same.
 *
 * Java samples the vein density at every block the rule reaches, and in vanilla it is not
 * positive almost anywhere: the vein toggle sits inside its dead band, or the block is outside
 * the vein's height range. With `cellBound`, the placer bounds the density once per cell and
 * skips every block of a cell whose bound is not positive. Such a block would have returned
 * before drawing, so the blocks and the draws are the same either way.
 */
export const compileOreVeinRule = (
    rule: OreVeinRule,
    compile: (node: DensityFunctionNode) => DensitySampler,
    randomFactory: PositionalRandomFactory,
    cellBound?: OreVeinCellBound
): OreVeinPlacer => {
    const density = compile(rule.density);
    const richness = compile(rule.richness);
    const fillerGap = compile(rule.fillerGap);

    const place: OreVeinPlacer = (context, x, y, z) => {
        const veinDensity = density(context, x, y, z);
        if (veinDensity <= 0) return undefined;

        const random = randomFactory.at(x, y, z);
        if (random.nextFloat() > veinDensity) return undefined;

        if (random.nextFloat() < richness(context, x, y, z) && fillerGap(context, x, y, z) < 0) {
            return random.nextFloat() < rule.rawOreChance ? rule.rawOreBlock : rule.oreBlock;
        }
        return rule.fillerBlock;
    };
    if (cellBound === undefined) return place;

    const { xz, y: height } = cellBound.cell;
    // Vanilla's cells are powers of two, and a shift floors the way `floorDiv` does.
    const shiftXz = (xz & (xz - 1)) === 0 ? Math.log2(xz) : -1;
    const shiftY = (height & (height - 1)) === 0 ? Math.log2(height) : -1;
    const keys = new Int32Array(VERDICT_SLOTS * 3);
    const verdicts = new Uint8Array(VERDICT_SLOTS);
    const box: DensityBox = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    const range: DensityRange = { lo: 0, hi: 0 };
    // A verdict holds for the context it was reached in; a blending context can move the density.
    let verdictContext: SampleContext | undefined;

    return (context, x, y, z) => {
        if (context !== verdictContext) {
            verdicts.fill(UNKNOWN);
            verdictContext = context;
        }

        const cellX = shiftXz >= 0 ? x >> shiftXz : floorDiv(x, xz);
        const cellY = shiftY >= 0 ? y >> shiftY : floorDiv(y, height);
        const cellZ = shiftXz >= 0 ? z >> shiftXz : floorDiv(z, xz);
        const slot = (cellX & 3) | ((cellZ & 3) << 2) | ((cellY & 63) << 4);
        const key = slot * 3;
        let verdict = verdicts[slot];
        if (verdict === UNKNOWN || keys[key] !== cellX || keys[key + 1] !== cellY || keys[key + 2] !== cellZ) {
            box.minX = cellX * xz;
            box.minY = cellY * height;
            box.minZ = cellZ * xz;
            box.maxX = box.minX + xz - 1;
            box.maxY = box.minY + height - 1;
            box.maxZ = box.minZ + xz - 1;
            cellBound.density(context, box, range);
            // An unbounded range may hide a NaN density, which `place` does not turn away.
            verdict = Number.isFinite(range.lo) && Number.isFinite(range.hi) && range.hi <= 0 ? BARREN : MAYBE;
            keys[key] = cellX;
            keys[key + 1] = cellY;
            keys[key + 2] = cellZ;
            verdicts[slot] = verdict;
        }
        return verdict === BARREN ? undefined : place(context, x, y, z);
    };
};
