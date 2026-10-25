import { defaultItemStackOps } from '@jsprismarine/predicates';
import type { ItemStack, ItemStackOps } from '@jsprismarine/predicates';

import {
    DAMAGE_COMPONENT,
    ENCHANTMENTS_COMPONENT,
    STORED_ENCHANTMENTS_COMPONENT,
    enchantmentsForCrafting,
    repairCostOf,
    withRepairCost
} from './item';
import { MIN_ENCHANTMENT_LEVEL } from './definition';
import type { EnchantmentRegistry } from './registry';

/** Levels at or above which a survival player sees "Too Expensive!" and gets nothing. */
export const ANVIL_COST_LIMIT = 40;

/** The highest cost a pure rename is allowed to reach, one below the limit. */
export const ANVIL_RENAME_COST_LIMIT = ANVIL_COST_LIMIT - 1;

/** One repair material restores this fraction of an item's durability. */
export const ANVIL_REPAIR_DIVISOR = 4;

/** Combining two damaged items adds this percent of maximum durability on top. */
export const ANVIL_COMBINE_BONUS_PERCENT = 12;

/** The item whose enchantments the anvil reads from `stored_enchantments`. */
export const ENCHANTED_BOOK_ITEM = 'minecraft:enchanted_book';

/** The component that holds a custom item name. */
export const CUSTOM_NAME_COMPONENT = 'minecraft:custom_name';

/** The two anvil slots and the name the player typed. */
export interface AnvilInput {
    /** Left slot: the item being worked on. */
    readonly base: ItemStack;
    /** Right slot: a repair material, a second copy of the item, or an enchanted book. */
    readonly addition?: ItemStack;
    /** The name the player typed, or undefined when the field was not touched. */
    readonly name?: string;
}

/** What the anvil would produce, and what it would charge. */
export interface AnvilResult {
    /** The result stack, or undefined when the anvil rejects the combination. */
    readonly output: ItemStack | undefined;
    /** Experience levels the player pays. */
    readonly cost: number;
    /** How many of the right stack a material repair consumes. */
    readonly materialCost: number;
    /** Whether the only change is the name, which is what lifts the cost ceiling to 39. */
    readonly onlyRenaming: boolean;
}

/** What the anvil needs besides the registry. */
export interface AnvilOptions {
    /** How result stacks are built; defaults to the plain record operations. */
    readonly items?: ItemStackOps;
    /**
     * A creative player ignores the level ceiling and may apply an
     * enchantment the item does not support.
     */
    readonly unlimitedMaterials?: boolean;
}

const REJECTED: AnvilResult = { output: undefined, cost: 0, materialCost: 0, onlyRenaming: false };

/**
 * The prior work penalty after one anvil use, which is what makes the fourth
 * or fifth combination of the same item unaffordable.
 */
export const increasedRepairCost = (cost: number): number => Math.min(cost * 2 + 1, 2147483647);

/**
 * Whether the anvil accepts a stack in its left slot. An enchanted book needs
 * stored enchantments; anything else qualifies, because in 26.3 every item
 * carries a default `minecraft:enchantments` component.
 */
export const canStoreEnchantments = (stack: ItemStack): boolean =>
    stack.id !== ENCHANTED_BOOK_ITEM || stack.components.has(STORED_ENCHANTMENTS_COMPONENT);

const enchantmentComponentOf = (stack: ItemStack): string =>
    stack.id === ENCHANTED_BOOK_ITEM ? STORED_ENCHANTMENTS_COMPONENT : ENCHANTMENTS_COMPONENT;

/**
 * Combines the two anvil slots.
 *
 * Java's `AnvilMenu.createResult` from the 26.3 server jar, step for step: the
 * material repair loop, the 12 percent bonus when two damaged items merge, the
 * enchantment merge where equal levels become one higher and unequal ones take
 * the larger, one level charged per incompatible enchantment, half the anvil
 * cost when the enchantments come from a book, and the prior work penalty
 * doubling on every use that is not a pure rename.
 *
 * Nothing here consumes items or experience; the caller decides whether the
 * player can pay and applies the result.
 */
export const combineInAnvil = (
    registry: EnchantmentRegistry,
    input: AnvilInput,
    options: AnvilOptions = {}
): AnvilResult => {
    const ops = options.items ?? defaultItemStackOps;
    const view = registry.items;
    const { base, addition } = input;
    if (!canStoreEnchantments(base)) return REJECTED;

    const maxDamageOf = (stack: ItemStack): number => view.maxDamage?.(stack) ?? 0;
    const damageOf = (stack: ItemStack): number => view.damage?.(stack) ?? 0;
    const isDamageable = (stack: ItemStack): boolean => maxDamageOf(stack) > 0;

    let output = base;
    let outputDamage = damageOf(base);
    let workCost = 0;
    let materialCost = 0;
    const priorWork = repairCostOf(base) + (addition === undefined ? 0 : repairCostOf(addition));
    const levels = new Map(enchantmentsForCrafting(base));

    if (addition !== undefined) {
        const additionIsBook = addition.components.has(STORED_ENCHANTMENTS_COMPONENT);

        if (isDamageable(base) && (view.repairsWith?.(base, addition) ?? false)) {
            const step = Math.trunc(maxDamageOf(base) / ANVIL_REPAIR_DIVISOR);
            if (Math.min(outputDamage, step) <= 0) return REJECTED;

            let used = 0;
            let repair = Math.min(outputDamage, step);
            while (repair > 0 && used < addition.count) {
                outputDamage -= repair;
                workCost += 1;
                repair = Math.min(outputDamage, step);
                used += 1;
            }
            materialCost = used;
        } else {
            if (!additionIsBook && (base.id !== addition.id || !isDamageable(base))) return REJECTED;

            if (isDamageable(base) && !additionIsBook) {
                const maxDamage = maxDamageOf(base);
                const baseRemaining = maxDamage - damageOf(base);
                const additionRemaining = maxDamageOf(addition) - damageOf(addition);
                const bonus = additionRemaining + Math.trunc((maxDamage * ANVIL_COMBINE_BONUS_PERCENT) / 100);
                const repaired = Math.max(0, maxDamage - (baseRemaining + bonus));

                if (repaired < outputDamage) {
                    outputDamage = repaired;
                    workCost += 2;
                }
            }

            let anyApplied = false;
            let anyRejected = false;
            for (const [enchantment, offered] of enchantmentsForCrafting(addition)) {
                const definition = registry.get(enchantment);
                if (definition === undefined) {
                    anyRejected = true;
                    continue;
                }

                const existing = levels.get(enchantment) ?? 0;
                let merged = existing === offered ? offered + 1 : Math.max(offered, existing);
                let applicable = registry.supports(base, enchantment);
                if (options.unlimitedMaterials === true || base.id === ENCHANTED_BOOK_ITEM) applicable = true;

                for (const present of levels.keys()) {
                    if (present === enchantment || registry.areCompatible(enchantment, present)) continue;
                    applicable = false;
                    workCost += 1;
                }

                if (!applicable) {
                    anyRejected = true;
                    continue;
                }

                anyApplied = true;
                merged = Math.min(merged, definition.maxLevel);
                levels.set(enchantment, merged);

                const perLevel = additionIsBook
                    ? Math.max(MIN_ENCHANTMENT_LEVEL, Math.trunc(definition.anvilCost / 2))
                    : definition.anvilCost;
                workCost += perLevel * merged;
                if (base.count > 1) workCost = ANVIL_COST_LIMIT;
            }

            if (anyRejected && !anyApplied) return REJECTED;
        }
    }

    let renameCost = 0;
    const currentName = view.displayName?.(base) ?? base.components.get(CUSTOM_NAME_COMPONENT);
    if (input.name === undefined || input.name.trim() === '') {
        if (base.components.has(CUSTOM_NAME_COMPONENT)) {
            renameCost = 1;
            workCost += renameCost;
            output = ops.withComponent(output, CUSTOM_NAME_COMPONENT, undefined);
        }
    } else if (input.name !== currentName) {
        renameCost = 1;
        workCost += renameCost;
        output = ops.withComponent(output, CUSTOM_NAME_COMPONENT, input.name);
    }

    let cost = workCost <= 0 ? 0 : Math.min(Math.max(priorWork + workCost, 0), 2147483647);
    let onlyRenaming = false;
    if (renameCost === workCost && renameCost > 0) {
        if (cost >= ANVIL_COST_LIMIT) cost = ANVIL_RENAME_COST_LIMIT;
        onlyRenaming = true;
    }

    if (workCost <= 0) return { output: undefined, cost, materialCost, onlyRenaming };
    if (cost >= ANVIL_COST_LIMIT && options.unlimitedMaterials !== true) {
        return { output: undefined, cost, materialCost, onlyRenaming };
    }

    let carriedRepairCost = repairCostOf(base);
    if (addition !== undefined) carriedRepairCost = Math.max(carriedRepairCost, repairCostOf(addition));
    if (renameCost !== workCost || renameCost === 0) carriedRepairCost = increasedRepairCost(carriedRepairCost);

    output = withRepairCost(output, carriedRepairCost, ops);
    output = ops.withComponent(output, enchantmentComponentOf(output), { levels: Object.fromEntries(levels) });
    if (isDamageable(base)) output = ops.withComponent(output, DAMAGE_COMPONENT, outputDamage);

    return { output, cost, materialCost, onlyRenaming };
};
