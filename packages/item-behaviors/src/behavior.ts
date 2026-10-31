/**
 * How a behavior family is written here.
 *
 * `@jsprismarine/content` wants a `Behavior<ItemHooks>` whose `create` runs
 * once per attached item type at load. Two things every family needs are not
 * in that signature: the world it acts on, and the item type's raw component
 * JSON. {@link itemBehavior} supplies both, so a family file is a list of
 * small objects and no plumbing.
 *
 * Reading raw JSON matters for exactly two components. The item package parses
 * `minecraft:consumable`'s `on_consume_effects` and
 * `minecraft:death_protection`'s `death_effects` down to the discriminator,
 * because the five effect types are the behavior layer's to run. Everything
 * else is read back through the item package's own parsers, which keep every
 * field.
 */
import type { Behavior, BindContext } from '@jsprismarine/content';
import type { ItemHooks, ItemStack, ItemType, ItemUseResult } from '@jsprismarine/items';

import { useCooldown } from '@jsprismarine/items';

import { spendDurability } from './formulas';
import type { ItemBehaviorEnvironment } from './items';
import type { ItemSource, ItemWorldActionKind, WorldActions } from './world';

/** A behavior for the item hook table. */
export type ItemBehavior = Behavior<ItemHooks>;

/** One hook name. */
export type ItemHookName = keyof ItemHooks & string;

/** What a family's `create` gets, which is the bind context plus the environment. */
export interface BehaviorContext extends ItemBehaviorEnvironment {
    /** The Bedrock identifier of the item type being bound. */
    readonly identifier: string;
    /**
     * The item type's default components as the definition writes them,
     * before the item package's schemas drop the fields they do not model.
     */
    readonly components: Readonly<Record<string, unknown>>;
}

/** What {@link itemBehavior} takes. */
export interface ItemBehaviorSpec {
    /** The behavior name, in this project's `vanilla:` namespace. */
    readonly name: string;
    /** Every hook the behavior may implement, which `content` checks against. */
    readonly hooks: readonly ItemHookName[];
    /**
     * Builds the handlers for one item type.
     *
     * Returning an empty object is how a component-driven family declines an
     * item that does not carry its component, which is what lets one behavior
     * attach to the whole registry and bind only where the data asks for it.
     */
    create(context: BehaviorContext): Partial<ItemHooks>;
}

/**
 * The raw `components` map of a definition.
 *
 * Both the bind context and a resolved type carry the definition, so the same
 * reader serves a behavior at load and an entry point at runtime.
 */
export const rawComponentsOf = (context: BindContext | ItemType): Readonly<Record<string, unknown>> => {
    const data = context.definition.data;
    if (typeof data !== 'object' || data === null) return {};
    const components = Object.entries(data).find(([name]) => name === 'components')?.[1];
    if (typeof components !== 'object' || components === null || Array.isArray(components)) return {};
    return Object.fromEntries(Object.entries(components));
};

/** Builds an {@link ItemBehavior} that closes over the world and the item factory. */
export const itemBehavior = (spec: ItemBehaviorSpec, environment: ItemBehaviorEnvironment): ItemBehavior => ({
    name: spec.name,
    hooks: spec.hooks,
    create: (context) =>
        spec.create({ ...environment, identifier: context.identifier, components: rawComponentsOf(context) })
});

/**
 * One component's value for a stack, raw.
 *
 * The patch wins when the stack has one, as everywhere else in the item model;
 * otherwise this is the type's own JSON rather than the parsed form, so the
 * fields the item package's schema drops are still there.
 */
export const rawComponent = (stack: ItemStack, name: string): unknown => {
    const patched = stack.patch.get(name);
    if (patched !== undefined) return patched.kind === 'set' ? patched.value : undefined;
    return rawComponentsOf(stack.type)[name];
};

/** How many ticks `minecraft:use_cooldown` asks for, or undefined when the item has none. */
export const cooldownTicksOf = (stack: ItemStack): number | undefined => {
    const cooldown = stack.params(useCooldown);
    return cooldown === undefined ? undefined : Math.round(cooldown.seconds * 20);
};

/** The cooldown group an item shares, which defaults to the item's own identifier. */
export const cooldownGroupOf = (stack: ItemStack): string =>
    stack.params(useCooldown)?.cooldown_group ?? stack.identifier;

/**
 * Starts the item's `minecraft:use_cooldown` if it has one, and reports it on
 * the result so the engine and the client agree on the number.
 */
export const withCooldown = (
    world: WorldActions,
    stack: ItemStack,
    source: ItemSource,
    result: ItemUseResult
): ItemUseResult => {
    const ticks = cooldownTicksOf(stack);
    if (ticks === undefined || ticks <= 0) return result;
    world.perform({ kind: 'start-cooldown', source, group: cooldownGroupOf(stack), ticks });
    return { ...result, cooldownTicks: ticks };
};

/**
 * Whether the host performs an action kind, which a behavior asks before it
 * spends its item on one.
 *
 * A host that cannot perform the action keeps the item: the behavior answers
 * `{}`, so the click is taken and the stack is unchanged, the way an eye of
 * ender with no stronghold in range is. A host without `supports` performs
 * everything.
 */
export const canPerform = (world: WorldActions, action: ItemWorldActionKind): boolean =>
    world.supports?.(action) !== false;

/** Whether the source is still waiting out the stack's cooldown group. */
export const onCooldown = (world: WorldActions, stack: ItemStack, source: ItemSource): boolean =>
    world.stateOf(source).cooldownGroups.includes(cooldownGroupOf(stack));

/**
 * Spends durability on the held stack and tells the world about it.
 *
 * Every family that wears an item out goes through here, so the Unbreaking
 * roll, the creative check and the "it broke" report happen in one place.
 *
 * @returns The stack to put back in the slot, unchanged when nothing was spent.
 */
export const spendItemDurability = (
    world: WorldActions,
    stack: ItemStack,
    source: ItemSource,
    amount: number
): ItemStack => {
    const spend = spendDurability(stack, amount, {
        random: world.random,
        creative: world.stateOf(source).creative
    });
    if (spend.amount > 0) {
        world.perform({ kind: 'consume-durability', source, amount: spend.amount, broke: spend.broke });
    }
    return spend.stack;
};

/**
 * Takes one item off a stack unless the user has infinite materials, which is
 * what every consumable, throwable and placement does.
 *
 * @returns The stack to put back in the slot.
 */
export const consumeOne = (stack: ItemStack, creative: boolean): ItemStack =>
    creative ? stack.copy() : stack.copy(stack.count - 1);
