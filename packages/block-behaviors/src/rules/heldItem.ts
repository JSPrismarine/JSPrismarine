/**
 * What the item in the hand lets a block do.
 *
 * `onPlace`, `onBreak` and `onPlayerInteract` carry a `HookItem`, which is an
 * identifier and a component reader. The questions the families ask of one
 * are here, so the item names and the enchantment ids are written down once
 * instead of once per family.
 *
 * Nothing here imports `@jsprismarine/items`. A `HookItem` is whatever the
 * server hands the hook, and that package's `ItemStack` satisfies the
 * interface structurally.
 */
import type { HookItem } from '@jsprismarine/blocks';

import { bareName } from '../state';

/** The bare name of a held item, empty for a bare hand. */
export const heldName = (item: HookItem | undefined): string => (item === undefined ? '' : bareName(item.identifier));

/** `minecraft:enchantments`, which holds a level per enchantment id. */
export const ENCHANTMENTS_COMPONENT = 'minecraft:enchantments';

/** `minecraft:potion_contents`, which names which potion a `minecraft:potion` is. */
export const POTION_CONTENTS_COMPONENT = 'minecraft:potion_contents';

/** Whether a component value is a plain JSON object rather than an array or null. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The level of one enchantment on a held item.
 *
 * The component value is parsed JSON the compiler cannot see into, so both
 * the map and the level are checked rather than assumed, and an unexpected
 * shape reads as not enchanted.
 *
 * @param enchantment - A namespaced enchantment id, such as `minecraft:silk_touch`.
 * @returns The level, or 0 when the item does not have the enchantment.
 */
export const enchantmentLevel = (item: HookItem | undefined, enchantment: string): number => {
    const value = item?.get(ENCHANTMENTS_COMPONENT);
    if (!isRecord(value)) return 0;
    const level = value[enchantment];
    return typeof level === 'number' ? level : 0;
};

/** Whether the held item is enchanted with silk touch, which makes a block drop itself. */
export const hasSilkTouch = (item: HookItem | undefined): boolean => enchantmentLevel(item, 'minecraft:silk_touch') > 0;

/** The fortune level on the held item, which multiplies an ore's drop. */
export const fortuneLevel = (item: HookItem | undefined): number => enchantmentLevel(item, 'minecraft:fortune');

/** Whether the held item is an axe of any material, which scrapes copper. */
export const isAxe = (item: HookItem | undefined): boolean => heldName(item).endsWith('_axe');

/** Whether the held item is shears, which cut leaves and vines loose. */
export const isShears = (item: HookItem | undefined): boolean => heldName(item) === 'shears';

/**
 * Whether the held item takes a block away whole rather than destroying it.
 *
 * Leaves, vines and the lichens drop themselves to shears or to a silk touch
 * tool and to nothing else, which is one rule across two families.
 */
export const cutsCleanly = (item: HookItem | undefined): boolean => isShears(item) || hasSilkTouch(item);

/** Whether the held item is honeycomb, which waxes copper and seals a sign. */
export const isHoneycomb = (item: HookItem | undefined): boolean => heldName(item) === 'honeycomb';

/** Whether the held item sets something alight: flint and steel or a fire charge. */
export const isIgniter = (item: HookItem | undefined): boolean => {
    const name = heldName(item);
    return name === 'flint_and_steel' || name === 'fire_charge';
};

/** Whether the held item is an empty bucket, which picks a liquid up. */
export const isEmptyBucket = (item: HookItem | undefined): boolean => heldName(item) === 'bucket';

/** What each filled bucket pours out, keyed by the bucket's bare name. */
export const BUCKET_CONTENTS: Readonly<Record<string, string>> = {
    water_bucket: 'water',
    lava_bucket: 'lava',
    powder_snow_bucket: 'powder_snow'
};

/**
 * What a filled bucket pours out.
 *
 * @returns `water`, `lava` or `powder_snow`, matching the cauldron's
 *   `cauldron_liquid` domain, or undefined when the item is not a filled
 *   bucket.
 */
export const bucketContents = (item: HookItem | undefined): string | undefined => BUCKET_CONTENTS[heldName(item)];

/** The filled bucket one of {@link BUCKET_CONTENTS}'s liquids goes into. */
export const bucketOf = (liquid: string): string => `minecraft:${liquid}_bucket`;

/** Whether the held item is an empty glass bottle, which scoops one bottle of water. */
export const isGlassBottle = (item: HookItem | undefined): boolean => heldName(item) === 'glass_bottle';

/**
 * Whether the held item is a bottle of water rather than a brewed potion.
 *
 * A water bottle is `minecraft:potion` whose `minecraft:potion_contents`
 * names water. The component is absent on a stack that never went through
 * brewing, which is also water, so an absent component counts.
 */
export const isWaterBottle = (item: HookItem | undefined): boolean => {
    if (heldName(item) !== 'potion') return false;
    const contents = item?.get(POTION_CONTENTS_COMPONENT);
    if (!isRecord(contents)) return true;
    const potion = contents['potion'];
    return potion === undefined || potion === 'minecraft:water';
};
