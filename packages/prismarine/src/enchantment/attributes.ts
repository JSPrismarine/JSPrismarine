/**
 * The `minecraft:attributes` effect component, which is how ten of the 43
 * enchantments work.
 *
 * Efficiency does not have a "mining speed" effect; it has an `add_value`
 * modifier of `levels_squared` on `minecraft:mining_efficiency`, and Java's
 * break-time formula adds that attribute to the tool's speed. Depth Strider,
 * Soul Speed, Swift Sneak, Respiration, Aqua Affinity, Fire Protection's burn
 * time and the three mace enchantments are all the same shape.
 *
 * Reading them through `runEffects` rather than through a table of levels is
 * what makes a datapack that changes `efficiency.json`'s amount take effect,
 * and what keeps a datapack enchantment on the same attribute working.
 */
import type { EnchantmentRegistry } from '@jsprismarine/enchantments';
import { enchantmentsOf } from '@jsprismarine/enchantments';
import type { ItemStack as PredicateItemStack } from '@jsprismarine/predicates';

/** The three operations an attribute modifier can use, summed separately. */
export interface AttributeContribution {
    /** `add_value`: added straight onto the base. */
    readonly addValue: number;
    /** `add_multiplied_base`: a fraction of the base, added after every `add_value`. */
    readonly addMultipliedBase: number;
    /** `add_multiplied_total`: a fraction of the running total, applied last. */
    readonly addMultipliedTotal: number;
}

const NOTHING: AttributeContribution = { addValue: 0, addMultipliedBase: 0, addMultipliedTotal: 0 };

/**
 * What one stack's enchantments contribute to one attribute.
 *
 * @param attribute - A namespaced attribute id, for example
 *   `minecraft:mining_efficiency`.
 */
export const attributeContributionOf = (
    registry: EnchantmentRegistry,
    stack: PredicateItemStack,
    attribute: string
): AttributeContribution => {
    const enchantments = enchantmentsOf(stack);
    if (enchantments.size === 0) return NOTHING;

    let addValue = 0;
    let addMultipliedBase = 0;
    let addMultipliedTotal = 0;

    registry.runEffects('attributes', { enchantments }, (run) => {
        if (run.effect.type !== 'attribute' || run.effect.attribute !== attribute) return;
        if (run.effect.operation === 'add_value') addValue += run.effect.amount;
        else if (run.effect.operation === 'add_multiplied_base') addMultipliedBase += run.effect.amount;
        else addMultipliedTotal += run.effect.amount;
    });

    return { addValue, addMultipliedBase, addMultipliedTotal };
};

/**
 * One attribute's value with a stack's enchantments applied, in Java's order:
 * every `add_value`, then every `add_multiplied_base` against the original
 * base, then every `add_multiplied_total` against the running total.
 */
export const attributeValueOf = (
    registry: EnchantmentRegistry,
    stack: PredicateItemStack,
    attribute: string,
    base: number
): number => {
    const { addValue, addMultipliedBase, addMultipliedTotal } = attributeContributionOf(registry, stack, attribute);
    return (base + addValue + base * addMultipliedBase) * (1 + addMultipliedTotal);
};
