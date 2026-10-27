import type { ComponentFactory, Holder, Type } from '@jsprismarine/content';
import { Instance } from '@jsprismarine/content';

import { maxStackSize } from './components/universal';
import type { ItemFlag, ItemHooks } from './hooks';

/**
 * One entry of a component patch.
 *
 * Java's `DataComponentPatch` is a map from component type to
 * `Optional<value>`, where the empty optional is the removal marker the
 * command grammar writes as `item_id[!minecraft:food]`. This union is that
 * optional, made explicit so a removal survives a round trip through JSON.
 */
export type PatchEntry = { readonly kind: 'set'; readonly value: unknown } | { readonly kind: 'remove' };

/** A component patch: the changes one stack layers over its type's defaults. */
export type ComponentPatch = ReadonlyMap<string, PatchEntry>;

/** The per-stack state an {@link ItemStack} keeps: how many, and the patch. */
export interface ItemStackState {
    /** How many items the stack holds. Zero means an empty stack. */
    count: number;
    /** The component patch, keyed by component name. */
    patch: Map<string, PatchEntry>;
}

/**
 * Compares two parsed component values structurally.
 *
 * Component values are parsed JSON, so this walks objects and lists rather
 * than comparing serialized NBT. Object key order does not matter; list order
 * does, because a list component such as `minecraft:lore` is ordered.
 */
export const componentValuesEqual = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    if (typeof left !== typeof right || left === null || right === null) return false;
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
        return left.every((item, index) => componentValuesEqual(item, right[index]));
    }
    if (typeof left !== 'object' || typeof right !== 'object') return false;

    const leftEntries = Object.entries(left);
    const rightRecord: Record<string, unknown> = { ...right };
    if (leftEntries.length !== Object.keys(rightRecord).length) return false;
    return leftEntries.every(([key, value]) => key in rightRecord && componentValuesEqual(value, rightRecord[key]));
};

/** Compares two component patches, ignoring the order entries were added in. */
export const patchesEqual = (left: ComponentPatch, right: ComponentPatch): boolean => {
    if (left.size !== right.size) return false;
    for (const [name, entry] of left) {
        const other = right.get(name);
        if (other === undefined || other.kind !== entry.kind) return false;
        if (entry.kind === 'set' && other.kind === 'set' && !componentValuesEqual(entry.value, other.value)) {
            return false;
        }
    }
    return true;
};

/**
 * One stack of items: a type reference, a count, and a component patch over
 * the type's default components.
 *
 * This is Java's model. The type holds the defaults, the stack holds only what
 * differs, and reading a component means reading the patch first and the
 * defaults second. A patch entry can remove a default outright, which is what
 * makes "this sword is not a weapon" expressible without a second item type.
 *
 * The type reference is a `Holder`, so a content reload points every live
 * stack at the new type without walking the world, and a stack whose
 * identifier the reload dropped reports that instead of reading a stale type.
 */
export class ItemStack extends Instance<ItemHooks, ItemStackState, ItemFlag> {
    /**
     * @param holder - A holder from the registry of resolved item types.
     * @param count - How many items, defaulting to one.
     * @param patch - The component patch, copied so later edits do not alias it.
     */
    public constructor(holder: Holder<Type<ItemHooks, ItemFlag>>, count = 1, patch: ComponentPatch = new Map()) {
        super(holder, { count, patch: new Map(patch) });
    }

    /** The Bedrock item identifier this stack is of. */
    public get identifier(): string {
        return this.holder.key;
    }

    /** How many items the stack holds. */
    public get count(): number {
        return this.state.count;
    }

    public set count(value: number) {
        this.state.count = value;
    }

    /** The component patch, as a read-only view of the stack's own map. */
    public get patch(): ComponentPatch {
        return this.state.patch;
    }

    /** Whether the stack holds nothing. */
    public get empty(): boolean {
        return this.state.count <= 0;
    }

    /**
     * The value of one component, patch first and the type's default second.
     *
     * @returns The value, or undefined when neither the patch nor the type has
     *   the component, and also when the patch removes it.
     */
    public get(name: string): unknown {
        const patched = this.state.patch.get(name);
        if (patched !== undefined) return patched.kind === 'set' ? patched.value : undefined;
        return this.type.components.find((component) => component.name === name)?.params;
    }

    /**
     * The parsed parameters of one component, narrowed against the factory
     * whose schema produced them.
     *
     * A patched value went through the same factory's schema when it was set
     * through {@link ItemStack.set}, so the narrowing holds for both layers.
     *
     * @returns The parameters, or undefined when the stack has no such component.
     */
    public params<P>(factory: ComponentFactory<ItemHooks, P>): P | undefined {
        const value = this.get(factory.name);
        if (value === undefined) return undefined;
        // The value came from this factory's schema, in the type's defaults or
        // through a checked `set`, so it is the factory's parameter type.
        return value as P;
    }

    /** Whether the stack has the component after the patch is applied. */
    public has(name: string): boolean {
        const patched = this.state.patch.get(name);
        if (patched !== undefined) return patched.kind === 'set';
        return this.type.hasComponent(name);
    }

    /** Sets one component on this stack, overriding the type's default. */
    public set(name: string, value: unknown): this {
        this.state.patch.set(name, { kind: 'set', value });
        return this;
    }

    /**
     * Removes one of the type's default components from this stack, which is
     * Java's `!component` marker. The entry stays in the patch, because
     * removing a default is a difference from the default.
     */
    public remove(name: string): this {
        this.state.patch.set(name, { kind: 'remove' });
        return this;
    }

    /** Drops a patch entry so the component falls back to the type's default. */
    public reset(name: string): this {
        this.state.patch.delete(name);
        return this;
    }

    /** Every component the stack has after the patch is applied, keyed by name. */
    public components(): ReadonlyMap<string, unknown> {
        const resolved = new Map<string, unknown>();
        for (const component of this.type.components) resolved.set(component.name, component.params);
        for (const [name, entry] of this.state.patch) {
            if (entry.kind === 'remove') resolved.delete(name);
            else resolved.set(name, entry.value);
        }
        return resolved;
    }

    /** A copy with the same type, count and patch, sharing no mutable state. */
    public copy(count = this.state.count): ItemStack {
        return new ItemStack(this.holder, count, this.state.patch);
    }
}

/**
 * Whether two stacks are the same item carrying the same components, which is
 * Java's `ItemStack.isSameItemSameComponents`.
 *
 * Java compares the item and then the whole `PatchedDataComponentMap`, whose
 * `equals` compares the prototype and the patch, verified by disassembling
 * `PatchedDataComponentMap` in the pinned 26.3 server jar. So a stack that
 * sets a component to the value the type already defaults to is not equal to
 * a stack with an empty patch, even though both read the same. The count is
 * not part of the comparison, and two empty stacks of the same item are equal
 * whatever their patches hold.
 */
export const sameItemSameComponents = (left: ItemStack, right: ItemStack): boolean => {
    if (left.identifier !== right.identifier) return false;
    if (left.empty && right.empty) return true;
    return patchesEqual(left.patch, right.patch);
};

/** How many of one item fit in a slot, from `minecraft:max_stack_size`. */
export const maxStackSizeOf = (stack: ItemStack): number => stack.params(maxStackSize) ?? 1;

/** Whether two stacks can merge: the same item, the same components, and room for more than one. */
export const canStack = (left: ItemStack, right: ItemStack): boolean =>
    maxStackSizeOf(left) > 1 && sameItemSameComponents(left, right);

/** What {@link mergeStacks} produced. */
export interface StackMerge {
    /** The target stack after the merge. */
    readonly merged: ItemStack;
    /** What did not fit, with a count of zero when everything did. */
    readonly remainder: ItemStack;
}

/**
 * Moves as much of one stack into another as the slot limit allows.
 *
 * @returns Both stacks as copies; neither argument is modified. When the two
 *   cannot stack, `merged` is the target unchanged and `remainder` is the
 *   whole source.
 */
export const mergeStacks = (into: ItemStack, from: ItemStack): StackMerge => {
    if (!canStack(into, from)) return { merged: into.copy(), remainder: from.copy() };
    const room = Math.max(0, maxStackSizeOf(into) - into.count);
    const moved = Math.min(room, from.count);
    return { merged: into.copy(into.count + moved), remainder: from.copy(from.count - moved) };
};
