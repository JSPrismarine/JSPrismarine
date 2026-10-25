import type { ComponentFactory, ComponentRegistry } from '@jsprismarine/content';

import type { ItemHooks } from '../hooks';
import type { Parser } from '../schema';

/**
 * One item data component type: a `ComponentFactory` that can add itself to a
 * registry without its parameter type escaping.
 *
 * `ComponentRegistry.register` is generic in the parameter type, so a list of
 * factories with different parameter types cannot be registered in a loop:
 * the inferred parameter would be a union, and a factory whose `create` takes
 * a narrower type is not assignable to one that takes the union. Carrying the
 * registration as a method on the factory closes over the real type instead,
 * which keeps the catalog a plain array while every exported component still
 * narrows `TypeView.params`.
 */
export interface ItemComponent<P = unknown> extends ComponentFactory<ItemHooks, P> {
    /** Adds this component to a registry under its own name. */
    register(registry: ComponentRegistry<ItemHooks>): void;
}

/** Builds an {@link ItemComponent} from a factory, keeping its parameter type. */
export const defineItemComponent = <P>(factory: ComponentFactory<ItemHooks, P>): ItemComponent<P> => ({
    ...factory,
    create: (params, context) => factory.create(params, context),
    register: (registry) => registry.register(factory)
});

/**
 * Builds a component that only carries parsed data.
 *
 * Most of Java's 122 data component types are exactly this: a validated value
 * an item type holds, with the behavior that reads it living in a behavior
 * family rather than in the component. A component that does implement a hook
 * uses {@link defineItemComponent} and declares it.
 *
 * @param name - The component name, as Java's registry writes it.
 * @param schema - The parser for the component's value.
 */
export const dataComponent = <P>(name: string, schema: Parser<P>): ItemComponent<P> =>
    defineItemComponent({ name, hooks: [], schema, create: () => ({}) });
