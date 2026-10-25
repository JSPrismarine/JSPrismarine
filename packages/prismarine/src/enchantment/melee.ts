/**
 * What the weapon's enchantments add to one swing.
 *
 * Two components and both are read off the stack in the attacker's main hand:
 * `minecraft:damage`, which Sharpness, Smite, Bane of Arthropods, Impaling and
 * Density declare, and `minecraft:knockback`, which Knockback and Punch
 * declare. Three of those five only answer certain victims - Smite's
 * `requirements` ask whether what is being hit is in
 * `#minecraft:sensitive_to_smite` - so the victim goes into the context as
 * `this_entity` even though the enchantment is on the attacker's weapon. That
 * is Java's own arrangement, not a convenience.
 */
import { enchantedDamageOf, knockbackBonusOf } from './values';
import { enchantedDamageContext } from './mitigation';
import type { ServerContent } from '../content/ServerContent';
import type { Item } from '../item/Item';
import type { LootKill } from '../entity/mobLoot';
import type { ViewableEntity, ViewableEquipment } from '../entity/predicateView';

/** What one swing is worked out from. */
export interface MeleeEnchantmentInput {
    /** The content build, or undefined when the server has none. */
    readonly content: ServerContent | undefined;
    /** The stack doing the hitting, or undefined for a bare hand. */
    readonly weapon: Item | undefined;
    /** Who is being hit. */
    readonly victim: ViewableEntity;
    /** What the victim is wearing, which the victim's own conditions read. */
    readonly victimEquipment?: ViewableEquipment;
    /** The blow, as the damage source predicates read it. */
    readonly source: LootKill;
}

/** What the weapon's enchantments are worth on one swing. */
export interface MeleeEnchantmentBonus {
    /** Half-hearts on top of the base, before the critical multiplier. */
    readonly damage: number;
    /** Knockback levels on top of the sprint. */
    readonly knockbackLevels: number;
}

/** A swing that no enchantment touched. */
const NOTHING: MeleeEnchantmentBonus = { damage: 0, knockbackLevels: 0 };

/**
 * The bonus one swing carries.
 *
 * @param base - The weapon's own damage, which `minecraft:damage` folds over.
 *   The bonus is the difference, because Java scales the base by the attack
 *   charge and the enchantment part linearly - see `attackDamage` in
 *   `@jsprismarine/item-behaviors`.
 * @returns Zeroes when the server built no content, when the hand is empty, or
 *   when the weapon carries no enchantment.
 */
export const meleeEnchantmentBonus = (input: MeleeEnchantmentInput, base: number): MeleeEnchantmentBonus => {
    const registry = input.content?.enchantments;
    const weapon = input.weapon;
    if (registry === undefined || weapon === undefined || weapon.getEnchantments().size === 0) return NOTHING;

    const context = enchantedDamageContext({
        content: input.content,
        victim: input.victim,
        equipment: input.victimEquipment ?? {},
        source: input.source
    });
    if (context === undefined) return NOTHING;

    const stack = weapon.asPredicateStack();
    return {
        damage: enchantedDamageOf(registry, stack, base, context) - base,
        knockbackLevels: knockbackBonusOf(registry, stack, context)
    };
};
