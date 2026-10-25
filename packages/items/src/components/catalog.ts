/**
 * Java 26.3's item data component registry, implemented as parsed components
 * for `@jsprismarine/content`.
 *
 * The catalog is split by how vanilla uses each type, and the split is
 * measured rather than chosen: thirteen types are a default on every one of
 * the 1658 items, fifty-six more are a default on some of them, and the
 * remaining fifty-three only ever appear on an individual stack. The three
 * numbers add up to the 122 entries of `minecraft:data_component_type` in the
 * pinned 26.3 `reports/registries.json`.
 */
import { ComponentRegistry } from '@jsprismarine/content';

import { DEFAULTED_COMPONENTS } from './defaults';
import type { ItemComponent } from './define';
import { STACK_ONLY_COMPONENTS } from './stackOnly';
import { UNIVERSAL_COMPONENTS } from './universal';
import type { ItemHooks } from '../hooks';

/** Every item data component type Java 26.3 registers, universal ones first. */
export const ITEM_COMPONENTS: readonly ItemComponent[] = [
    ...UNIVERSAL_COMPONENTS,
    ...DEFAULTED_COMPONENTS,
    ...STACK_ONLY_COMPONENTS
];

/** The name of every component in {@link ITEM_COMPONENTS}, in the same order. */
export const ITEM_COMPONENT_NAMES: readonly string[] = ITEM_COMPONENTS.map((component) => component.name);

/**
 * Builds a registry holding all 122 component types.
 *
 * @param extra - Components a plugin adds, registered after the vanilla ones
 *   so a duplicate name fails loudly rather than replacing a vanilla type.
 * @throws {ContentError} When `extra` repeats a name the catalog already has.
 */
export const createItemComponentRegistry = (extra: readonly ItemComponent[] = []): ComponentRegistry<ItemHooks> => {
    const registry = new ComponentRegistry<ItemHooks>();
    for (const component of [...ITEM_COMPONENTS, ...extra]) component.register(registry);
    return registry;
};
