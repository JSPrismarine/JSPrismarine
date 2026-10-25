import { asNumber, isJsonObject, member, namespaced } from '@jsprismarine/predicates';
import type { ItemStack, ItemStackOps, MemberSet } from '@jsprismarine/predicates';

/** Enchantments applied to an item, which is what the effect machinery reads. */
export const ENCHANTMENTS_COMPONENT = 'minecraft:enchantments';
/** Enchantments an enchanted book carries but does not apply. */
export const STORED_ENCHANTMENTS_COMPONENT = 'minecraft:stored_enchantments';
/** Levels the anvil has already charged for an item, its prior work penalty. */
export const REPAIR_COST_COMPONENT = 'minecraft:repair_cost';
/** Enchantability, which widens the enchanting table's level draw. */
export const ENCHANTABLE_COMPONENT = 'minecraft:enchantable';
/** Items that repair this one in the anvil. */
export const REPAIRABLE_COMPONENT = 'minecraft:repairable';
/** Durability of an item that takes damage. */
export const MAX_DAMAGE_COMPONENT = 'minecraft:max_damage';
/** Damage an item has already taken. */
export const DAMAGE_COMPONENT = 'minecraft:damage';

/**
 * Item questions this package cannot answer from a stack's components alone.
 * Every member is optional and every one has a default that reads the
 * component a vanilla item would carry, so a host with a real item registry
 * overrides only what it knows better.
 */
export interface ItemView {
    /** Namespaced item tags the item carries, without the leading `#`. */
    tagsOf?(itemId: string): readonly string[];
    /**
     * The item's enchantability, which widens the enchanting table's level
     * draw. Zero or undefined means the table refuses the item.
     */
    enchantmentValue?(stack: ItemStack): number | undefined;
    /** Durability, or 0 when the item takes no damage. */
    maxDamage?(stack: ItemStack): number;
    /** Damage the stack has already taken. */
    damage?(stack: ItemStack): number;
    /** Whether `material` repairs `stack` in the anvil's right slot. */
    repairsWith?(stack: ItemStack, material: ItemStack): boolean;
    /**
     * The name the client shows for a stack, which the anvil compares a typed
     * name against. Without it the anvil only knows the custom name, so
     * renaming an unnamed item back to its default name still costs a level.
     */
    displayName?(stack: ItemStack): string | undefined;
}

const levelsFrom = (component: unknown): ReadonlyMap<string, number> => {
    if (!isJsonObject(component)) return new Map();

    const nested = member(component, 'levels');
    const source = isJsonObject(nested) ? nested : component;
    const levels = new Map<string, number>();
    for (const [id, level] of Object.entries(source)) {
        const value = asNumber(level);
        if (value !== undefined) levels.set(namespaced(id), Math.trunc(value));
    }
    return levels;
};

/**
 * Reads the `minecraft:enchantments` component, accepting both the
 * `{"levels": {...}}` wrapper Java writes and a bare identifier-to-level map.
 */
export const enchantmentsOf = (stack: ItemStack): ReadonlyMap<string, number> =>
    levelsFrom(stack.components.get(ENCHANTMENTS_COMPONENT));

/** Reads the `minecraft:stored_enchantments` component an enchanted book carries. */
export const storedEnchantmentsOf = (stack: ItemStack): ReadonlyMap<string, number> =>
    levelsFrom(stack.components.get(STORED_ENCHANTMENTS_COMPONENT));

/**
 * The enchantments the anvil combines, which are the stored ones on an
 * enchanted book and the applied ones on anything else.
 */
export const enchantmentsForCrafting = (stack: ItemStack): ReadonlyMap<string, number> => {
    const stored = storedEnchantmentsOf(stack);
    return stored.size > 0 ? stored : enchantmentsOf(stack);
};

/** Reads the `minecraft:repair_cost` component, which is the anvil's prior work penalty. */
export const repairCostOf = (stack: ItemStack): number => asNumber(stack.components.get(REPAIR_COST_COMPONENT)) ?? 0;

/** Writes an enchantment map back as a `minecraft:enchantments` component. */
export const withEnchantments = (stack: ItemStack, levels: ReadonlyMap<string, number>, ops: ItemStackOps): ItemStack =>
    ops.withComponent(stack, ENCHANTMENTS_COMPONENT, { levels: Object.fromEntries(levels) });

/** Writes the `minecraft:repair_cost` component. */
export const withRepairCost = (stack: ItemStack, cost: number, ops: ItemStackOps): ItemStack =>
    ops.withComponent(stack, REPAIR_COST_COMPONENT, cost);

const componentNumber = (stack: ItemStack, component: string): number => {
    const value = stack.components.get(component);
    const direct = asNumber(value);
    if (direct !== undefined) return direct;
    return asNumber(member(value, 'value')) ?? 0;
};

const matchesSelector = (itemId: string, selector: unknown, view: ItemView): boolean => {
    const entries = Array.isArray(selector) ? selector : [selector];
    return entries.some((entry) => {
        if (typeof entry !== 'string') return false;
        if (!entry.startsWith('#')) return namespaced(entry) === itemId;
        return (view.tagsOf?.(itemId) ?? []).includes(namespaced(entry.slice(1)));
    });
};

/**
 * An {@link ItemView} that knows only what a stack's own components say. Every
 * answer comes from the component a vanilla item of that kind carries:
 * `minecraft:enchantable`, `minecraft:max_damage`, `minecraft:damage` and
 * `minecraft:repairable`. It cannot answer `tagsOf`, so a tag-named item set
 * matches nothing until a host supplies the item tags.
 */
export const componentItemView: ItemView = {
    enchantmentValue: (stack) => componentNumber(stack, ENCHANTABLE_COMPONENT) || undefined,
    maxDamage: (stack) => componentNumber(stack, MAX_DAMAGE_COMPONENT),
    damage: (stack) => componentNumber(stack, DAMAGE_COMPONENT),
    repairsWith: (stack, material) =>
        matchesSelector(material.id, member(stack.components.get(REPAIRABLE_COMPONENT), 'items'), componentItemView)
};

/**
 * Whether a stack is in a set that an enchantment's `supported_items`,
 * `primary_items` or an effect's block list names. Ids match directly; a tag
 * matches when the view reports the item carries it.
 */
export const stackMatches = (stack: ItemStack, members: MemberSet, view: ItemView): boolean => {
    if (members.ids.has(namespaced(stack.id))) return true;
    const tags = view.tagsOf?.(namespaced(stack.id)) ?? [];
    return members.tags.some((tag) => tags.includes(tag));
};
