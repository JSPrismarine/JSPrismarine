import { isFallingBlock } from '@jsprismarine/block-behaviors';
import { bedrockLiquidReactionOf, isWashedAway as liquidTakesThePlaceOf } from '@jsprismarine/blocks';

/**
 * Which blocks obey which bit of physics.
 *
 * Answered from the published tables rather than from the registered `Block` classes,
 * deliberately. The class registry covers eighty of the twelve hundred blocks the client knows,
 * and `World.getBlock` hands back air for anything outside it - so a rule that consulted the
 * classes would silently do nothing for most of what world generation actually places, which is
 * the worst possible failure for physics: it looks implemented and is not.
 *
 * Two tables answer three of the four rules. `@jsprismarine/blocks` publishes what a liquid does
 * to every palette block, captured from a Bedrock Dedicated Server, which decides both what a
 * liquid washes away and what rests on the ground. `@jsprismarine/block-behaviors` owns which
 * blocks fall, because Java decides that by class and publishes no list at all.
 */

/** A bare block name, without the namespace a palette identifier carries. */
const bareName = (name: string): string => name.replace(/^[^:]*:/, '');

/**
 * The blocks a liquid pops that are not standing on anything.
 *
 * A liquid pops the same blocks that rest on what is under them, which is what makes it a good
 * answer to {@link needsSupport} - but it also pops what hangs on a wall, grows from a ceiling or
 * floats in water, and `BlockPhysics` only ever looks down. Taking those back out by name is the
 * one part of these rules no table answers.
 */
const HANGS_OR_FLOATS: ReadonlySet<string> = new Set([
    'kelp',
    'seagrass',
    'sea_pickle',
    'vine',
    'twisting_vines',
    'weeping_vines',
    'web',
    'waterlily',
    'fire',
    'soul_fire',
    'chorus_plant',
    'chorus_flower',
    'spore_blossom',
    'shelf_mushroom',
    'straw_bed'
]);

/** The families of the above: a torch and a head go on walls, and coral grows in water. */
const hangsOrFloats = (name: string): boolean => {
    const bare = bareName(name);
    return (
        HANGS_OR_FLOATS.has(bare) ||
        bare.endsWith('torch') ||
        bare.endsWith('_head') ||
        bare.endsWith('_skull') ||
        bare.includes('coral')
    );
};

/**
 * The still and moving forms of each liquid, which physics has to treat as one substance.
 *
 * How far and how fast each one travels is not here: `@jsprismarine/engine-systems` carries
 * Java's own rates and owns the spread. What is left is the pair of identifiers the support
 * and gravity rules need in order to recognize liquid at all.
 */
export interface LiquidKind {
    readonly still: string;
    readonly flowing: string;
}

export const WATER: LiquidKind = {
    still: 'minecraft:water',
    flowing: 'minecraft:flowing_water'
};

export const LAVA: LiquidKind = {
    still: 'minecraft:lava',
    flowing: 'minecraft:flowing_lava'
};

export const LIQUIDS: readonly LiquidKind[] = [WATER, LAVA];

/** The liquid a block is, if it is one. */
export const liquidOf = (name: string): LiquidKind | null =>
    LIQUIDS.find((liquid) => liquid.still === name || liquid.flowing === name) ?? null;

/**
 * Whether a block needs something beneath it.
 *
 * A plant is not attached to the ground so much as resting on it, so removing what it stands on
 * removes the plant. Vanilla drops it rather than deleting it, which is what makes mining under a
 * field of wheat give you the wheat.
 *
 * The blocks that rest on the ground are the blocks a liquid pops or breaks, which is a column a
 * Bedrock Dedicated Server publishes: every crop, carpet, rail, sapling, flower and mushroom, the
 * snow layers, 151 names against the thirty this used to list by hand. Only what hangs on a wall
 * or floats comes back out, by {@link hangsOrFloats}.
 * @param {string} name - The block's state name.
 * @returns {boolean} Whether it breaks when its support goes.
 */
export const needsSupport = (name: string): boolean => {
    const reaction = bedrockLiquidReactionOf(name);
    if (reaction !== 'popped' && reaction !== 'broken') return false;
    return !hangsOrFloats(name);
};

/**
 * Whether a block falls under its own weight.
 *
 * `@jsprismarine/block-behaviors` owns the answer, because the families it carries are what
 * actually performs a fall when the content runtime is on, and two lists would drift. It knows
 * the loose ground blocks, all sixteen concrete powders, the anvils, the dragon egg and the
 * brushable blocks.
 * @param {string} name - The block's state name.
 * @returns {boolean} Whether gravity applies to it.
 */
export const falls = (name: string): boolean => isFallingBlock(name);

/**
 * Whether a liquid may take this block's place.
 *
 * Vanilla drowns plants rather than damming water behind them, which is also what stops a field
 * of wheat from holding back a river. Air and the liquids themselves count, since a liquid
 * occupies their cell without doing anything to them.
 * @param {string} name - The block's state name.
 * @returns {boolean} Whether liquid flows into it.
 */
export const isWashedAway = (name: string): boolean => liquidTakesThePlaceOf(name);
