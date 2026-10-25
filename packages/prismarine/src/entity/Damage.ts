import { DamageCause } from './DamageCause';

/**
 * How much of a blow actually lands.
 *
 * Pure arithmetic and nothing else - no entity, no world, no packets - because these are the
 * numbers players will compare against a wiki, and a formula that can be read on its own is a
 * formula that can be checked. Everything that decides *whether* to hurt something lives in
 * `Entity.damage`; this only says by how much.
 *
 * The order matters and is vanilla's: armor first, then the enchantments on that armor, then
 * resistance. Applying them in any other order gives a different answer, because each one takes
 * a percentage of whatever the previous one left.
 * @see https://minecraft.wiki/w/Armor#Damage_protection
 */

/**
 * The most damage armor can take off, as a percentage of the blow.
 *
 * Twenty points against a divisor of twenty-five, so a full set of the best armor still lets a
 * fifth of every hit through. There is no build in vanilla that makes a player untouchable by
 * armor alone, and this is the line that guarantees it.
 */
const MAX_ARMOR_POINTS = 20;
const ARMOR_DIVISOR = 25;

/**
 * What toughness does: it softens the *penalty big hits impose on armor*.
 *
 * Without it, armor's usefulness falls away as the blow gets harder - which is the
 * `defensePoints - damage / 2` term. Toughness raises that divisor, so diamond holds up against
 * a hard hit where iron does not.
 */
const TOUGHNESS_BASE_DIVISOR = 2;
const TOUGHNESS_DIVISOR = 4;

/** Armor never protects less than a flat fifth of its points, however hard the blow. */
const MIN_ARMOR_FRACTION = 5;

/**
 * The protection total is capped the same way armor is, and counted the same way.
 *
 * Java's `CombatRules.getDamageAfterMagicAbsorb`, and the cap is why a second
 * full set of Protection IV is worth nothing: four pieces already reach 16 of
 * the 20 the formula will take.
 */
const MAX_ENCHANTMENT_PROTECTION = 20;
const ENCHANTMENT_DIVISOR = 25;

/** Each level of Resistance takes off a fifth, so level five stops everything. */
const RESISTANCE_PER_LEVEL = 0.2;
const MAX_RESISTANCE_LEVEL = 5;

/**
 * Everything that gets through armor points regardless of how much of it is worn.
 *
 * Drowning, starving and hitting the ground are not blows, and a breastplate has never helped
 * with any of them. Fire and lava are deliberately absent: armor does reduce a burn.
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
 * Separate from the set above, and it has to be: a fall ignores armor points but is still
 * reduced by Feather Falling, which is the whole reason anyone enchants boots. Folding the two
 * together made the best boots in the game do nothing.
 *
 * Empty, and that is Java's answer rather than an omission. Java gates this step on
 * `#minecraft:bypasses_enchantments`, whose only member is `minecraft:sonic_boom` - a warden's
 * shriek, which this server has no `DamageCause` for. Everything else is decided by each
 * enchantment's own `requirements`: all five of the Protection family refuse a source in
 * `#minecraft:bypasses_invulnerability`, which is what keeps them off the void, and Fire
 * Protection, Blast Protection, Projectile Protection and Feather Falling each name the one
 * damage tag they answer. This set held Starvation and Void before the components were read,
 * and the first of those was wrong: Java's Protection does reduce starving.
 */
const BYPASSES_ENCHANTMENTS: ReadonlySet<DamageCause> = new Set();

/** What the damage pipeline knows about the entity being hit. */
export interface Mitigation {
    /** Armor points worn, out of twenty. */
    defensePoints: number;
    /** Armor toughness, which only diamond and netherite have. */
    toughness: number;
    /**
     * The Enchantment Protection Factor of everything worn, already summed.
     *
     * The total of every `minecraft:damage_protection` effect component that
     * answered this particular blow; see `enchantmentProtection` in
     * `src/enchantment/mitigation.ts`, which is what works it out.
     */
    enchantmentProtection: number;
    /** The level of the Resistance effect, or zero. */
    resistance: number;
    /** Whether the cause ignores armor points. */
    bypassesArmor: boolean;
    /** Whether it ignores the enchantments on that armor too. */
    bypassesEnchantments: boolean;
}

/**
 * Whether armor points are any use against this kind of damage.
 * @param {DamageCause} cause - What did the damage.
 * @returns {boolean} `true` if the armor step should be skipped.
 */
export const bypassesArmor = (cause: DamageCause): boolean => BYPASSES_ARMOR.has(cause);

/**
 * Whether the enchantments on that armor are any use either.
 * @param {DamageCause} cause - What did the damage.
 * @returns {boolean} `true` if the protection step should be skipped.
 */
export const bypassesEnchantments = (cause: DamageCause): boolean => BYPASSES_ENCHANTMENTS.has(cause);

/**
 * What armor leaves of a blow.
 * @param {number} damage - The blow, in half-hearts.
 * @param {number} defensePoints - Armor points worn.
 * @param {number} toughness - Armor toughness.
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
 * What the `damage_protection` enchantments leave of what armor let through.
 *
 * Which enchantments contributed, and how much each one was worth, is decided
 * by their files rather than here: this is only Java's `CombatRules` arithmetic
 * over whatever total they came to.
 * @param {number} damage - What armor let through.
 * @param {number} enchantmentProtection - The summed Enchantment Protection Factor.
 * @returns {number} What gets through.
 */
export const protectionReduced = (damage: number, enchantmentProtection: number): number => {
    if (enchantmentProtection <= 0) return damage;

    return damage * (1 - Math.min(MAX_ENCHANTMENT_PROTECTION, enchantmentProtection) / ENCHANTMENT_DIVISOR);
};

/**
 * What the Resistance effect leaves.
 * @param {number} damage - What the armor left.
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
