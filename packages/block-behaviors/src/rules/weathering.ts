/**
 * Copper oxidation, waxing and scraping.
 *
 * Every copper block is one name made of three parts: an optional `waxed_`
 * prefix, an optional oxidation prefix, and the shape. Reading a name into
 * those parts and writing it back is the whole of the family, so the
 * transitions are pure functions here and the random tick that drives them is
 * in the family.
 */

/** The oxidation prefixes, in the order a block passes through them. */
export const WEATHERING_STAGES = ['', 'exposed', 'weathered', 'oxidized'] as const;

/** How far along the four oxidation stages a copper block is. */
export type WeatheringStage = 0 | 1 | 2 | 3;

/** A copper block's name read into its three parts. */
export interface CopperName {
    /** True when honeycomb sealed the block and it no longer oxidizes. */
    readonly waxed: boolean;
    readonly stage: WeatheringStage;
    /** The shape, such as `cut_copper_stairs`, with `copper` for the plain block. */
    readonly shape: string;
}

const STAGE_INDEX = new Map<string, WeatheringStage>([
    ['exposed', 1],
    ['weathered', 2],
    ['oxidized', 3]
]);

/**
 * The copper blocks the palette has that do not oxidize: the two ores, the
 * raw block and the Education Edition chemistry torch. The copper family
 * still covers them, because the identifier rule matches on the word, and
 * they behave as plain blocks.
 */
const UNWEATHERING_COPPER: ReadonlySet<string> = new Set([
    'copper_ore',
    'deepslate_copper_ore',
    'raw_copper_block',
    'copper_torch'
]);

/**
 * Reads a copper block's identifier into its parts.
 *
 * @returns Undefined for a name that holds copper but does not oxidize.
 */
export const parseCopperName = (identifier: string): CopperName | undefined => {
    let name = identifier.replace(/^[^:]*:/, '');
    if (!name.includes('copper')) return undefined;
    if (UNWEATHERING_COPPER.has(name)) return undefined;

    const waxed = name.startsWith('waxed_');
    if (waxed) name = name.slice('waxed_'.length);

    const underscore = name.indexOf('_');
    const prefix = underscore === -1 ? '' : name.slice(0, underscore);
    const stage = STAGE_INDEX.get(prefix);
    const shape = stage === undefined ? name : name.slice(underscore + 1);

    return { waxed, stage: stage ?? 0, shape: shape === 'copper_block' ? 'copper' : shape };
};

/** Writes the parts back into an identifier, in the namespace of the block they came from. */
export const copperIdentifier = (identifier: string, parts: CopperName): string => {
    const namespace = identifier.includes(':') ? identifier.slice(0, identifier.indexOf(':')) : 'minecraft';
    const stage = WEATHERING_STAGES[parts.stage];
    // Unoxidized copper is `copper_block`, but its waxed form is `waxed_copper`.
    const shape = parts.stage === 0 && parts.shape === 'copper' && !parts.waxed ? 'copper_block' : parts.shape;
    const oxidized = stage === '' ? shape : `${stage}_${shape}`;
    return `${namespace}:${parts.waxed ? `waxed_${oxidized}` : oxidized}`;
};

/**
 * The block one oxidation step further along.
 *
 * @returns Undefined when the block is waxed, fully oxidized, or not a
 *   weathering copper block at all.
 */
export const weatheredIdentifier = (identifier: string): string | undefined => {
    const parts = parseCopperName(identifier);
    if (parts === undefined || parts.waxed || parts.stage === 3) return undefined;
    return copperIdentifier(identifier, { ...parts, stage: (parts.stage + 1) as WeatheringStage });
};

/**
 * The block an axe scrape produces: one stage back, or the unwaxed block
 * when it was waxed, which is the order Bedrock applies the two.
 *
 * @returns Undefined when there is nothing to scrape off.
 */
export const scrapedIdentifier = (identifier: string): string | undefined => {
    const parts = parseCopperName(identifier);
    if (parts === undefined) return undefined;
    if (parts.waxed) return copperIdentifier(identifier, { ...parts, waxed: false });
    if (parts.stage === 0) return undefined;
    return copperIdentifier(identifier, { ...parts, stage: (parts.stage - 1) as WeatheringStage });
};

/**
 * The block honeycomb produces.
 *
 * @returns Undefined when the block is already waxed or does not weather.
 */
export const waxedIdentifier = (identifier: string): string | undefined => {
    const parts = parseCopperName(identifier);
    if (parts === undefined || parts.waxed) return undefined;
    return copperIdentifier(identifier, { ...parts, waxed: true });
};

/**
 * The chance one random tick advances a copper block's oxidation.
 *
 * Java weights this by how many copper blocks are nearby and how oxidized
 * they are. The weights are in a class the repository does not carry, so the
 * family uses the flat rate the wiki measures for an isolated block.
 */
export const WEATHERING_CHANCE = 1 / 1000;
