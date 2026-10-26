/**
 * The smallest stack this package can work with: what the item is, how many of
 * it there are, and its data components. The real item type lives in another
 * package, so a host adapts its own stack to this shape at the edge and plugs
 * the operations in through {@link ItemStackOps}.
 */
export interface ItemStack {
    /** Namespaced item identifier, for example `minecraft:diamond`. */
    readonly id: string;
    readonly count: number;
    /** Bedrock auxiliary item data, carried by loot functions such as `set_data_from_color_index`. */
    readonly meta?: number;
    /** Data components keyed by namespaced component type, for example `minecraft:enchantments`. */
    readonly components: ReadonlyMap<string, unknown>;
}

/**
 * Every way an item modifier changes or inspects a stack. Injecting it lets a
 * host keep its own allocation, component defaults and per-item limits while
 * the 42 modifiers stay unchanged.
 */
export interface ItemStackOps {
    /** Builds a fresh stack with no components. */
    create(id: string, count: number): ItemStack;
    withId(stack: ItemStack, id: string): ItemStack;
    withCount(stack: ItemStack, count: number): ItemStack;
    /** Sets Bedrock's auxiliary item data, or clears it when undefined. */
    withMeta?(stack: ItemStack, meta: number | undefined): ItemStack;
    /** Sets a component, or removes it when `value` is undefined. */
    withComponent(stack: ItemStack, type: string, value: unknown): ItemStack;
    component(stack: ItemStack, type: string): unknown;
    /** Largest count the item allows, which `set_count` and `limit_count` clamp to. */
    maxStackSize(stack: ItemStack): number;
    /** Durability of the item, or 0 when it takes no damage. */
    maxDamage(stack: ItemStack): number;
}

const copyComponents = (stack: ItemStack, type: string, value: unknown): ReadonlyMap<string, unknown> => {
    const components = new Map(stack.components);
    if (value === undefined) components.delete(type);
    else components.set(type, value);
    return components;
};

/**
 * Immutable record operations over the built-in {@link ItemStack}. Every item
 * stacks to 64 and takes no damage, because this package has no item registry;
 * a host with one should override `maxStackSize` and `maxDamage`.
 */
export const defaultItemStackOps: ItemStackOps = {
    create: (id, count) => ({ id, count, components: new Map() }),
    withId: (stack, id) => ({ ...stack, id }),
    withCount: (stack, count) => ({ ...stack, count }),
    withMeta: (stack, meta) => ({ ...stack, ...(meta === undefined ? { meta: undefined } : { meta }) }),
    withComponent: (stack, type, value) => ({ ...stack, components: copyComponents(stack, type, value) }),
    component: (stack, type) => stack.components.get(type),
    maxStackSize: () => 64,
    maxDamage: () => 0
};

/**
 * Enchantment facts the evaluator cannot derive from a stack alone. The
 * enchantment registry lives in another package, so `apply_bonus`,
 * `table_bonus`, `enchant_randomly` and `enchant_with_levels` read it through
 * this seam. An unimplemented member makes the modifier report a diagnostic
 * and leave the stack alone.
 */
export interface EnchantmentView {
    /** Level of an enchantment on a stack, or 0 when it is absent. */
    levelOn?(stack: ItemStack, enchantment: string): number;
    /** Highest level an enchantment reaches, used when `enchant_randomly` picks a level. */
    maxLevel?(enchantment: string): number | undefined;
    /** Enchantments that may go on an item, used when `enchant_randomly` lists no options. */
    applicableTo?(stack: ItemStack): readonly string[];
    /** Runs the enchanting table draw for `enchant_with_levels`. */
    selectRandomEnchantments?(
        stack: ItemStack,
        levels: number,
        options: readonly string[] | undefined
    ): ReadonlyMap<string, number> | undefined;
}

/**
 * Reads the level of an enchantment from the `minecraft:enchantments`
 * component, accepting both the `{"levels": {...}}` wrapper Java writes and a
 * bare identifier-to-level map.
 */
export const enchantmentLevelFromComponent = (stack: ItemStack, enchantment: string): number => {
    const component = stack.components.get('minecraft:enchantments');
    if (typeof component !== 'object' || component === null) return 0;

    const record: Record<string, unknown> = { ...component };
    const levels = record['levels'];
    const source: Record<string, unknown> = typeof levels === 'object' && levels !== null ? { ...levels } : record;
    const level = source[enchantment];
    return typeof level === 'number' ? level : 0;
};

/** What `exploration_map` is asked to find. */
export interface ExplorationMapRequest {
    /** Namespaced structure id or tag the map should point at. */
    readonly destination: string;
    /** Namespaced map decoration id. */
    readonly decoration: string;
    readonly zoom: number;
    readonly searchRadius: number;
    readonly skipExistingChunks: boolean;
}

/**
 * Content lookups a few item modifiers need that this package cannot own,
 * because smelting recipes, player profiles, structure search and the dye
 * color table live elsewhere. An unimplemented member makes the modifier
 * report a diagnostic and leave the stack unchanged.
 */
export interface ContentView {
    /** Result of smelting one item, for `furnace_smelt`. */
    smeltingResult?(stack: ItemStack): ItemStack | undefined;
    /** Value for the `minecraft:profile` component of an entity, for `fill_player_head`. */
    profileOf?(entity: unknown): unknown;
    /** Builds the map item for `exploration_map`, or undefined when no structure was found. */
    explorationMap?(stack: ItemStack, request: ExplorationMapRequest): ItemStack | undefined;
    /** Rolls loot pool entries into stacks, for `set_contents`. */
    rollEntries?(entries: unknown): readonly ItemStack[] | undefined;
    /** The packed RGB values of the dye colors, for `set_random_dyes`. */
    dyeColors?(): readonly number[];
}

/** An {@link EnchantmentView} that only knows what the stack's own components say. */
export const defaultEnchantmentView: EnchantmentView = {
    levelOn: enchantmentLevelFromComponent
};
