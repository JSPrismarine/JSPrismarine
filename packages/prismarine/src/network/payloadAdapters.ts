import { ItemInstanceUserData, NetworkBinaryStream } from '@jsprismarine/protocol';

import type { CreativeContent, ItemStackData } from '@jsprismarine/protocol';
import type { CreativeEntry, CreativeGroup } from '../inventory/CreativeInventory';
import type { Item } from '../item/Item';

/** Converts this server's item model into the stack data Protocol writes. */
export const itemAsStack = (item: Item): ItemStackData => {
    const blob = new NetworkBinaryStream();
    const blocksAttacks = item.hasComponent('minecraft:blocks_attacks');
    new ItemInstanceUserData(null, blocksAttacks ? { blockingTick: 0n } : {}).serialize(blob);

    return {
        // Air is the empty slot, whose wire id is zero. The item table assigns air -158.
        runtimeId: item.getName() === 'minecraft:air' ? 0 : item.getRuntimeId(),
        count: item.getAmount(),
        meta: item.meta,
        blockRuntimeId: item.getBlockRuntimeId(),
        userData: blob.getBuffer()
    };
};

/** Builds the Protocol creative payload from the server's item-backed creative catalog. */
export const creativeContentFrom = (
    groups: readonly CreativeGroup[],
    entries: readonly CreativeEntry[]
): CreativeContent => ({
    groups: groups.map(({ category, name, icon }) => ({ category, name, icon: itemAsStack(icon) })),
    entries: entries.map(({ item, group }) => ({ item: itemAsStack(item), group }))
});
