/**
 * A mob's `inventory` container read and written by item identifier, which is how the goals, the
 * villager work and the item sharing count and hand over what a mob carries
 * ([plan](../../../../../docs/plans/unified-item-slots.md)).
 *
 * The goal world speaks identifiers with no counts: `inventory()` is one identifier per item.
 * These helpers turn the container's stacks into that list and write a change to the list back as
 * slot writes, so a stack nobody touched keeps its enchantments and its name.
 */
import type { ItemContainer } from '../../inventory/ItemContainer';
import type { Item } from '../../item/Item';

/** Each item a container holds as its identifier, one per item, in slot order. */
export const identifiersIn = (container: ItemContainer): string[] =>
    container.stacks().flatMap((item) => Array.from({ length: item.getAmount() }, () => item.getName()));

/** How many items of one identifier a container holds. */
export const countIn = (container: ItemContainer, identifier: string): number =>
    container.stacks().reduce((count, item) => count + (item.getName() === identifier ? item.getAmount() : 0), 0);

/**
 * Takes items of one identifier out of a container, from the first slot on.
 * @param count - How many to take at most.
 * @returns How many it took.
 */
export const takeFrom = (container: ItemContainer, identifier: string, count: number): number => {
    let remaining = Math.max(0, count);
    for (const [slot, item] of container.items().entries()) {
        if (remaining <= 0) break;
        if (item === null || item.getName() !== identifier) continue;
        const taken = Math.min(item.getAmount(), remaining);
        container.set(slot, taken === item.getAmount() ? null : item.withCount(item.getAmount() - taken));
        remaining -= taken;
    }
    return Math.max(0, count) - remaining;
};

/**
 * Puts stacks into a container, as many as fit.
 * @returns What did not fit, as stacks, which the caller drops.
 */
export const addTo = (container: ItemContainer, items: readonly Item[]): Item[] =>
    items.flatMap((item) => {
        const left = container.add(item);
        return left > 0 ? [item.withCount(left)] : [];
    });

/**
 * Runs work that edits a list of identifiers in place, such as a villager baking bread, on the
 * container's identifiers, then writes the difference back: the items the work removed are taken
 * from the first slots that hold them, and the items it added are put in.
 * @param itemOf - Makes a stack of an identifier, or null for one the content has no item for.
 * @returns What the work returned, and the added stacks that did not fit.
 */
export const editIdentifiers = <T>(
    container: ItemContainer,
    work: (identifiers: string[]) => T,
    itemOf: (identifier: string, count: number) => Item | null
): { readonly result: T; readonly overflow: Item[] } => {
    const before = identifiersIn(container);
    const after = [...before];
    const result = work(after);

    const change = new Map<string, number>();
    for (const identifier of before) change.set(identifier, (change.get(identifier) ?? 0) - 1);
    for (const identifier of after) change.set(identifier, (change.get(identifier) ?? 0) + 1);
    for (const [identifier, delta] of change) if (delta < 0) takeFrom(container, identifier, -delta);
    const added = [...change].flatMap(([identifier, delta]) => {
        const item = delta > 0 ? itemOf(identifier, delta) : null;
        return item === null ? [] : [item];
    });
    return { result, overflow: addTo(container, added) };
};
