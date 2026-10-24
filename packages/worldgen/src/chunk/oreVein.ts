import type { DensitySampler } from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import type { SampleContext } from '../density/SampleContext';
import { normalizeIdentifier } from '../identifier';
import type { PositionalRandomFactory } from '../random/RandomSource';

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

const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(value)}`);
    }
    // A parsed JSON document is `unknown`; every field read below is checked.
    return value as Record<string, unknown>;
};

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
        throw new TypeError(`${path}.raw_ore_chance: expected a finite number`);
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

/**
 * Compiles an ore vein rule into a placer.
 *
 * The three random draws happen in Java's order: one against the vein density, one against
 * the richness, and one against the raw-ore chance. Reordering them changes which blocks the
 * same seed produces even though the distribution stays the same.
 */
export const compileOreVeinRule = (
    rule: OreVeinRule,
    compile: (node: DensityFunctionNode) => DensitySampler,
    randomFactory: PositionalRandomFactory
): OreVeinPlacer => {
    const density = compile(rule.density);
    const richness = compile(rule.richness);
    const fillerGap = compile(rule.fillerGap);

    return (context, x, y, z) => {
        const veinDensity = density(context, x, y, z);
        if (veinDensity <= 0) return undefined;

        const random = randomFactory.at(x, y, z);
        if (random.nextFloat() > veinDensity) return undefined;

        if (random.nextFloat() < richness(context, x, y, z) && fillerGap(context, x, y, z) < 0) {
            return random.nextFloat() < rule.rawOreChance ? rule.rawOreBlock : rule.oreBlock;
        }
        return rule.fillerBlock;
    };
};
