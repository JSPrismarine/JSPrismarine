/**
 * The slots an entity's active `minecraft:equippable` lists: where a player can put a saddle,
 * armor or a carpet on a mount, and which items each slot takes.
 *
 * `@jsprismarine/entities` keeps the component's body as written, so this reads it once for the
 * container size and the interaction that equips a declared slot.
 */
import type { EntityInstance } from '@jsprismarine/entities';

import { isRecord } from '../../utils/isRecord';

/** One slot an equippable declares. */
export interface EquippableSlot {
    /** The slot's index in Bedrock's mount screen, which is not the container index. */
    readonly slot: number;
    /** The item names the slot takes, as the pack spells them, such as `carpet` or `minecraft:saddle`. */
    readonly acceptedItems: readonly string[];
}

/** The slots the entity's active `minecraft:equippable` lists, in the order it lists them. */
export const equippableSlotsOf = (instance: EntityInstance): readonly EquippableSlot[] => {
    const declared = instance.componentParams('minecraft:equippable');
    const slots = isRecord(declared) ? declared['slots'] : undefined;
    if (!Array.isArray(slots)) return [];
    return slots.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const slot = entry['slot'];
        const accepted = entry['accepted_items'];
        const item = entry['item'];
        const names = Array.isArray(accepted) ? accepted.filter((name) => typeof name === 'string') : [];
        if (typeof item === 'string' && !names.includes(item)) names.push(item);
        return typeof slot === 'number' && Number.isSafeInteger(slot) && slot >= 0
            ? [{ slot, acceptedItems: names }]
            : [];
    });
};

/** How many equipment slots the entity's container keeps at its front. */
export const equippableSlotCount = (instance: EntityInstance): number => equippableSlotsOf(instance).length;
