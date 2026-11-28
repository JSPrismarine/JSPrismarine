/**
 * A Java client's inventory packets as the intents a Bedrock client's decode into
 * ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 */
import type { JavaItemStack } from '@jsprismarine/protocol/java/packet/play';

import type { Intent } from '../../input/Intent';
import type { ShownContainer } from '../../player/presenter/SessionPresenter';
import type { EditionTranslation } from './editionTranslation';

/**
 * The container slot a slot of the Java inventory window stands for, the inverse of
 * `javaWindowSlotOf`. The crafting slots, 0 to 4, stand for none.
 * @param windowSlot - The slot of window 0.
 * @returns The container and its slot, or undefined.
 */
export const containerSlotOf = (
    windowSlot: number
): { readonly container: Exclude<ShownContainer, 'cursor'>; readonly slot: number } | undefined => {
    if (windowSlot >= 5 && windowSlot <= 8) return { container: 'armor', slot: windowSlot - 5 };
    if (windowSlot >= 9 && windowSlot <= 35) return { container: 'inventory', slot: windowSlot };
    if (windowSlot >= 36 && windowSlot <= 44) return { container: 'inventory', slot: windowSlot - 36 };
    if (windowSlot === 45) return { container: 'offhand', slot: 0 };
    return undefined;
};

/**
 * The intent a `Set Creative Mode Slot` decodes into.
 * @param packet - The window slot and its stack.
 * @param items - Java item ids to Bedrock identifiers.
 * @returns The intent, or undefined for a slot no container has, such as -1, a stack thrown out of
 *   the creative screen.
 */
export const javaCreativeSlotIntentOf = (
    { slot, item }: { readonly slot: number; readonly item: JavaItemStack | null },
    items: EditionTranslation<string, number | undefined>
): Intent<'setCreativeSlot'> | undefined => {
    const target = containerSlotOf(slot);
    if (target === undefined) return undefined;
    return {
        kind: 'setCreativeSlot',
        ...target,
        item: item === null ? null : { name: items.toBedrock(item.item), count: item.count }
    };
};

/**
 * The intent a serverbound `Set Held Item` decodes into.
 * @param slot - The hotbar slot the client says it holds.
 * @returns The intent, or undefined for a slot outside the hotbar's 0 to 8.
 */
export const javaHotbarIntentOf = (slot: number): Intent<'selectHotbarSlot'> | undefined =>
    Number.isInteger(slot) && slot >= 0 && slot <= 8 ? { kind: 'selectHotbarSlot', slot } : undefined;
