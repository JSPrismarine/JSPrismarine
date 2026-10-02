import { DamageCause } from './DamageCause';

/**
 * How much of a blow actually lands.
 *
 * Pure arithmetic and nothing else - no entity, no world, no packets - because these are the
 * numbers players will compare against a wiki, and a formula that can be read on its own is a
 * formula that can be checked. Everything that decides *whether* to hurt something lives in
 * `Entity.damage`; this only says by how much.
 *
 * The order matters and is vanilla's: armour first, then the enchantments on that armour, then
 * resistance. Applying them in any other order gives a different answer, because each one takes
 * a percentage of whatever the previous one left.
 * @see https://minecraft.wiki/w/Armor#Damage_protection
 */

/**
 * The most damage armour can take off, as a percentage of the blow.
 *
 * Twenty points against a divisor of twenty-five, so a full set of the best armour still lets a
 * fifth of every hit through. There is no build in vanilla that makes a player untouchable by
 * armour alone, and this is the line that guarantees it.
 */
const MAX_ARMOR_POINTS = 20;
const ARMOR_DIVISOR = 25;

/**
 * What toughness does: it softens the *penalty big hits impose on armour*.
 *
 * Without it, armour's usefulness falls away as the blow gets harder - which is the
 * `defensePoints - damage / 2` term. Toughness raises that divisor, so diamond holds up against
 * a hard hit where iron does not.
 */
const TOUGHNESS_BASE_DIVISOR = 2;
const TOUGHNESS_DIVISOR = 4;

/** Armour never protects less than a flat fifth of its points, however hard the blow. */
const MIN_ARMOR_FRACTION = 5;

/** Enchantment protection is capped the same way armour is, and counted the same way. */
const MAX_ENCHANTMENT_PROTECTION = 20;
const ENCHANTMENT_DIVISOR = 25;

/** Each level of Resistance takes off a fifth, so level five stops everything. */
const RESISTANCE_PER_LEVEL = 0.2;
const MAX_RESISTANCE_LEVEL = 5;

/**
 * Everything that gets through armour points regardless of how much of it is worn.
 *
 * Drowning, starving and hitting the ground are not blows, and a breastplate has never helped
 * with any of them. Fire and lava are deliberately absent: armour does reduce a burn.
 */
const BYPASSES_ARMOR: ReadonlySet<DamageCause> = new Set([
    DamageCause.Drowning,
    DamageCause.Starvation,
    DamageCause.Void,
    DamageCause.Magic,
    DamageCause.Wither,
    DamageCause.Fall,
    DamageCause.Suffocation
]);

/**
 * The much shorter list that gets through the *enchantments* as well.
 *
 * Separate from the set above, and it has to be: a fall ignores armour points but is still
 * reduced by Feather Falling, which is the whole reason anyone enchants boots. Folding the two
 * together made the best boots in the game do nothing.
 */
const BYPASSES_ENCHANTMENTS: ReadonlySet<DamageCause> = new Set([DamageCause.Starvation, DamageCause.Void]);

/** What the damage pipeline knows about the entity being hit. */
export interface Mitigation {
    /** Armour points worn, out of twenty. */
    defensePoints: number;
    /** Armour toughness, which only diamond and netherite have. */
    toughness: number;
    /** The Enchantment Protection Factor of everything worn, already summed. */
    enchantmentProtection: number;
    /** The level of the Resistance effect, or zero. */
    resistance: number;
    /** Whether the cause ignores armour points. */
    bypassesArmor: boolean;
    /** Whether it ignores the enchantments on that armour too. */
    bypassesEnchantments: boolean;
}

/**
 * Whether armour points are any use against this kind of damage.
 * @param {DamageCause} cause - What did the damage.
 * @returns {boolean} `true` if the armour step should be skipped.
 */
export const bypassesArmor = (cause: DamageCause): boolean => BYPASSES_ARMOR.has(cause);

/**
 * Whether the enchantments on that armour are any use either.
 * @param {DamageCause} cause - What did the damage.
 * @returns {boolean} `true` if the protection step should be skipped.
 */
export const bypassesEnchantments = (cause: DamageCause): boolean => BYPASSES_ENCHANTMENTS.has(cause);

/**
 * What armour leaves of a blow.
 * @param {number} damage - The blow, in half-hearts.
 * @param {number} defensePoints - Armour points worn.
 * @param {number} toughness - Armour toughness.
 * @returns {number} What gets through.
 * @example
 * ```typescript
 * // A full set of iron, against a hard hit.
 * armorReduced(10, 15, 0); // => 4.6
 * ```
 */
export const armorReduced = (damage: number, defensePoints: number, toughness: number): number => {
    if (defensePoints <= 0) return damage;

    const softened = defensePoints - damage / (TOUGHNESS_BASE_DIVISOR + toughness / TOUGHNESS_DIVISOR);
    const effective = Math.min(MAX_ARMOR_POINTS, Math.max(defensePoints / MIN_ARMOR_FRACTION, softened));

    return damage * (1 - effective / ARMOR_DIVISOR);
};

/**
 * What the Protection enchantments leave of what armour let through.
 * @param {number} damage - What armour let through.
 * @param {number} enchantmentProtection - The summed Enchantment Protection Factor.
 * @returns {number} What gets through.
 */
export const protectionReduced = (damage: number, enchantmentProtection: number): number => {
    if (enchantmentProtection <= 0) return damage;

    return damage * (1 - Math.min(MAX_ENCHANTMENT_PROTECTION, enchantmentProtection) / ENCHANTMENT_DIVISOR);
};

/**
 * What the Resistance effect leaves.
 * @param {number} damage - What the armour left.
 * @param {number} level - The effect's level; five and above stops everything.
 * @returns {number} What gets through.
 */
export const resistanceReduced = (damage: number, level: number): number => {
    if (level <= 0) return damage;
    if (level >= MAX_RESISTANCE_LEVEL) return 0;

    return damage * (1 - level * RESISTANCE_PER_LEVEL);
};

/**
 * The whole reduction, in vanilla's order.
 * @param {number} damage - The raw blow, in half-hearts.
 * @param {Mitigation} mitigation - What the entity is wearing and under.
 * @returns {number} What reaches the entity's health, never below zero.
 */
export const reduceDamage = (damage: number, mitigation: Mitigation): number => {
    if (damage <= 0) return 0;

    let remaining = damage;

    if (!mitigation.bypassesArmor) {
        remaining = armorReduced(remaining, mitigation.defensePoints, mitigation.toughness);
    }

    if (!mitigation.bypassesEnchantments) {
        remaining = protectionReduced(remaining, mitigation.enchantmentProtection);
    }

    remaining = resistanceReduced(remaining, mitigation.resistance);

    return Math.max(0, remaining);
};
