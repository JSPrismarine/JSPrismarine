/**
 * Making item stacks from an identifier.
 *
 * A behavior hands back an item the user did not have a moment ago more often
 * than it looks: the bucket a milk bucket leaves, the bottle a potion leaves,
 * the filled map an empty one becomes, the water bucket a lava bucket is not.
 * Building one needs the registry, which is the server's, so it arrives as a
 * factory rather than as a second import.
 */
import type { ItemRegistry, ItemStack } from '@jsprismarine/items';
import { ItemStack as Stack } from '@jsprismarine/items';

import type { WorldActions } from './world';

/** Makes an item stack from a Bedrock identifier. */
export interface ItemFactory {
    /**
     * One stack of an item.
     *
     * @returns The stack, or undefined when no item type is registered under
     *   the identifier, which a behavior treats as "do nothing" rather than
     *   as an error.
     */
    create(identifier: string, count?: number): ItemStack | undefined;
}

/** The world and the item factory together, which is what a behavior needs. */
export interface ItemBehaviorEnvironment {
    /** The world the behaviors act on. */
    readonly world: WorldActions;
    /** The factory they build result stacks with. */
    readonly items: ItemFactory;
}

/** An {@link ItemFactory} over a registry of resolved item types. */
export const itemFactoryFor = (registry: ItemRegistry): ItemFactory => ({
    create: (identifier, count = 1) =>
        registry.has(identifier) ? new Stack(registry.holder(identifier), count) : undefined
});

/** An {@link ItemFactory} whose registry is supplied after the behaviors are registered. */
export interface DeferredItemFactory extends ItemFactory {
    /** Points the factory at a registry; calling it again repoints it, which a content reload does. */
    bind(registry: ItemRegistry): void;
}

/**
 * An {@link ItemFactory} for the load order the registry forces.
 *
 * `registerVanillaItemBehaviors` runs before `loadItemTypes`, and the
 * registry it would need does not exist until after. Nothing calls the
 * factory until a hook fires, which is later still, so one indirection is
 * enough.
 */
export const deferredItemFactory = (): DeferredItemFactory => {
    let bound: ItemRegistry | undefined;
    return {
        bind: (registry) => {
            bound = registry;
        },
        create: (identifier, count = 1) =>
            bound !== undefined && bound.has(identifier) ? new Stack(bound.holder(identifier), count) : undefined
    };
};
