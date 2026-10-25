/**
 * Wiring the families into a `BehaviorRegistry`.
 *
 * `registerVanillaItemBehaviors` is the whole public entry point: the server
 * builds a registry, calls it once, and passes the registry to
 * `loadItemTypes({ behaviors })`.
 *
 * Two things this module decides, and both matter.
 *
 * **What each behavior attaches to.** A family the data describes attaches to
 * every item and binds nothing where the component is absent, so a pack's own
 * food eats and a pack's own tool mines with no registration. A family the
 * data does not describe attaches to a list of identifiers, computed from the
 * classifier against the pinned table, because there is nothing in the item
 * to recognize it by.
 *
 * **What order they attach in.** `HookTable.dispatchFirst` stops at the first
 * handler that returns a value, so a specialized family has to come before
 * the general one it builds on: the potion before the consumable, the mace
 * before the melee weapon, the stripping transform before the mining tool.
 * {@link VANILLA_ITEM_BEHAVIORS} is that order and `registry.test.ts` holds
 * it.
 */
import type { BehaviorRegistry } from '@jsprismarine/content';
import type { ItemHooks } from '@jsprismarine/items';
import { itemTypesTable } from '@jsprismarine/items';

import type { ItemBehaviorSpec } from './behavior';
import { itemBehavior } from './behavior';
import { BOOK_BEHAVIORS } from './behaviors/books';
import { COMBAT_BEHAVIORS } from './behaviors/combat';
import { CONSUME_BEHAVIORS } from './behaviors/consume';
import { FLUID_BEHAVIORS } from './behaviors/fluids';
import { INTERACTION_BEHAVIORS } from './behaviors/interaction';
import { MINING_BEHAVIORS } from './behaviors/mining';
import { NAVIGATION_BEHAVIORS } from './behaviors/navigation';
import { PLACEMENT_BEHAVIORS } from './behaviors/placement';
import { PROJECTILE_BEHAVIORS } from './behaviors/projectiles';
import { WEARABLE_BEHAVIORS } from './behaviors/wearable';
import { classifyItem, ITEM_FAMILIES } from './families';
import type { ItemBehaviorEnvironment } from './items';

/**
 * Every vanilla behavior, in attachment order.
 *
 * The groups are ordered so that a behavior which only performs effects and
 * declines the result comes before the one that produces it.
 */
export const VANILLA_ITEM_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    ...PLACEMENT_BEHAVIORS,
    ...FLUID_BEHAVIORS,
    ...PROJECTILE_BEHAVIORS,
    ...NAVIGATION_BEHAVIORS,
    ...INTERACTION_BEHAVIORS,
    ...BOOK_BEHAVIORS,
    ...MINING_BEHAVIORS,
    ...COMBAT_BEHAVIORS,
    ...CONSUME_BEHAVIORS,
    ...WEARABLE_BEHAVIORS
];

/**
 * The behaviors that recognize their own work from the item's components.
 *
 * Each attaches to every identifier and returns no handlers where the
 * component is missing, which is what makes them work for content this
 * package has never heard of.
 */
export const COMPONENT_DRIVEN_BEHAVIORS: ReadonlySet<string> = new Set([
    'vanilla:block_transformer',
    'vanilla:bundle',
    'vanilla:consumable',
    'vanilla:dye',
    'vanilla:equippable',
    'vanilla:firework_rocket',
    'vanilla:goat_horn',
    'vanilla:melee_weapon',
    'vanilla:mining_tool',
    'vanilla:mob_bucket',
    'vanilla:ominous_bottle',
    'vanilla:potion',
    'vanilla:shield',
    'vanilla:spawn_egg',
    'vanilla:spear',
    'vanilla:suspicious_stew',
    'vanilla:writable_book'
]);

/** Which families name each behavior, inverted from the family catalog. */
const familiesByBehavior = (): ReadonlyMap<string, ReadonlySet<string>> => {
    const byBehavior = new Map<string, Set<string>>();
    for (const family of ITEM_FAMILIES) {
        for (const behavior of family.behaviors) {
            const families = byBehavior.get(behavior) ?? new Set<string>();
            families.add(family.name);
            byBehavior.set(behavior, families);
        }
    }
    return byBehavior;
};

/**
 * The Bedrock identifier of every item in one of the named families.
 *
 * The classifier works on Java items and the registry is keyed by Bedrock
 * identifiers, so this is the join: each row of the table says which Java
 * item its properties came from, and the family of that item is the family of
 * the Bedrock identity.
 */
export const bedrockIdentifiersInFamilies = (families: ReadonlySet<string>): readonly string[] => {
    const identifiers: string[] = [];
    for (const [identifier, row] of Object.entries(itemTypesTable.items)) {
        const family = classifyItem({ identifier: row.java, components: row.components });
        if (families.has(family)) identifiers.push(identifier);
    }
    return identifiers;
};

/** What one behavior attaches to: every identifier, or a computed list. */
export const selectorFor = (behavior: string): string | readonly string[] | ((identifier: string) => boolean) => {
    if (COMPONENT_DRIVEN_BEHAVIORS.has(behavior)) return () => true;
    const families = familiesByBehavior().get(behavior);
    return families === undefined ? [] : bedrockIdentifiersInFamilies(families);
};

/**
 * Registers and attaches every vanilla item behavior.
 *
 * @param registry - The registry to pass to `loadItemTypes({ behaviors })`.
 * @param environment - The world the behaviors act on and the factory they
 *   build result stacks with.
 * @throws {ContentError} When a behavior name is already registered, which
 *   means this ran twice against the same registry.
 */
export const registerVanillaItemBehaviors = (
    registry: BehaviorRegistry<ItemHooks>,
    environment: ItemBehaviorEnvironment
): void => {
    for (const spec of VANILLA_ITEM_BEHAVIORS) {
        registry.register(itemBehavior(spec, environment));
        registry.attach(spec.name, selectorFor(spec.name));
    }
};
