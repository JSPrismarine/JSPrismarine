/**
 * The value components an enchantment folds over a vanilla number.
 *
 * `EnchantmentRegistry.modifyValue` is the whole mechanism and this module is
 * the shape of each call: which component, what the vanilla number was, and
 * which loot context parameters the component's `requirements` evaluate
 * against. Nothing here decides what an enchantment does - `protection.json`
 * says `add` a `linear` of `1.0` per level when the damage source is not in
 * `#minecraft:bypasses_invulnerability`, and this only makes sure that
 * sentence is asked the right question.
 *
 * Why the folds take an iterable of stacks rather than one merged enchantment
 * map: Java runs each equipment slot's enchantments separately against one
 * running total, so four pieces of Protection IV is four applications of the
 * effect and not one. Merging the maps first would collapse them into a single
 * Protection IV and quarter the result.
 *
 * `armor_effectiveness` is deliberately absent. Breach is the only enchantment
 * that declares it, and where Java multiplies the result in - against the armor
 * value or against the toughness - is not something the file says and not
 * something this repository's pinned sources settle. A fold that was applied to
 * the wrong term would be worse than the gap.
 */
import type { EffectComponentType, EnchantmentRegistry } from '@jsprismarine/enchantments';
import { enchantmentsOf } from '@jsprismarine/enchantments';
import type {
    DamageSource as PredicateDamageSource,
    EntityView,
    ItemStack as PredicateItemStack,
    Vec3
} from '@jsprismarine/predicates';

/**
 * The `enchanted_damage` parameters, which is the key set nine of the 31
 * components evaluate against and all four combat components below use.
 */
export interface EnchantedDamageContext {
    /**
     * `this_entity`: whoever the effect is asked about. Java passes the
     * *victim* for every one of these components, including `damage` on the
     * attacker's weapon - which is what lets Smite ask whether what is being
     * hit is undead.
     */
    readonly entity: EntityView;
    readonly damageSource: PredicateDamageSource;
    /** `origin`, which defaults to the entity's own position. */
    readonly origin?: Vec3;
}

/** The origin a context with no position falls back to. */
const NOWHERE: Vec3 = { x: 0, y: 0, z: 0 };

const parametersOf = (context: EnchantedDamageContext) => ({
    parameterSet: 'enchanted_damage' as const,
    parameters: {
        this_entity: context.entity,
        origin: context.origin ?? context.entity.position ?? NOWHERE,
        damage_source: context.damageSource,
        attacking_entity: context.damageSource.sourceEntity,
        direct_attacking_entity: context.damageSource.directEntity ?? context.damageSource.sourceEntity
    }
});

/**
 * Folds one value component over a starting number, one stack at a time.
 *
 * @param stacks - The enchanted items in the order Java visits them: the
 *   equipment slots for a worn component, the one weapon for a held one.
 * @param base - The vanilla number before any enchantment touches it.
 * @returns The number after every matching effect, which is `base` when no
 *   stack carries an enchantment that declares the component.
 */
export const foldEnchantedValue = (
    registry: EnchantmentRegistry,
    component: EffectComponentType,
    base: number,
    stacks: Iterable<PredicateItemStack>,
    context: EnchantedDamageContext
): number => {
    const options = parametersOf(context);

    let running = base;
    for (const stack of stacks) {
        const enchantments = enchantmentsOf(stack);
        if (enchantments.size === 0) continue;
        running = registry.modifyValue(component, running, { enchantments, context: options });
    }
    return running;
};

/**
 * The Enchantment Protection Factor of everything worn, which is Java's
 * `EnchantmentHelper.getDamageProtection`: one running total across every
 * equipment slot, starting at zero.
 *
 * Each enchantment states for itself which damage it answers. Protection
 * answers anything not in `#minecraft:bypasses_invulnerability`, Fire
 * Protection only `#minecraft:is_fire`, Feather Falling only
 * `#minecraft:is_fall`. Those are `damage_source_properties` conditions in the
 * files, so the damage source's `tags` have to be filled in or none of them
 * matches.
 */
export const damageProtectionOf = (
    registry: EnchantmentRegistry,
    worn: Iterable<PredicateItemStack>,
    context: EnchantedDamageContext
): number => foldEnchantedValue(registry, 'damage_protection', 0, worn, context);

/**
 * What the weapon's enchantments make of a blow, which is Java's
 * `EnchantmentHelper.modifyDamage`: the base damage folded through the
 * weapon's own `damage` effects.
 *
 * The bonus a swing carries is this minus the base, because Java scales the
 * two differently - see `attackDamage` in `@jsprismarine/item-behaviors`.
 */
export const enchantedDamageOf = (
    registry: EnchantmentRegistry,
    weapon: PredicateItemStack,
    base: number,
    context: EnchantedDamageContext
): number => foldEnchantedValue(registry, 'damage', base, [weapon], context);

/**
 * Extra knockback levels the weapon adds, which is Java's
 * `EnchantmentHelper.modifyKnockback` from zero. Knockback and Punch are the
 * two that declare it.
 */
export const knockbackBonusOf = (
    registry: EnchantmentRegistry,
    weapon: PredicateItemStack,
    context: EnchantedDamageContext
): number => foldEnchantedValue(registry, 'knockback', 0, [weapon], context);
