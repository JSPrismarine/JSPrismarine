import {
    creative_groups as CreativeGroups,
    creativeitems as CreativeItems,
    item_table as ItemTable
} from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import { Item } from '../item/Item';
import type { CreativeEntry, CreativeGroup } from '../network/packet/CreativeContentPacket';
import { creativeCategoryOf } from '../network/packet/CreativeContentPacket';

/** A registered block or item, as far as the creative menu reads one. */
export interface CreativeRegistryEntry {
    getName(): string;
    getId(): number;
}

/**
 * The registries the creative menu is built from.
 *
 * A full `Server` fits. A test only has to supply these two managers.
 */
export interface CreativeRegistries {
    getBlockManager(): { getBlocks(): readonly CreativeRegistryEntry[] };
    getItemManager(): { getItems(): readonly CreativeRegistryEntry[] };
}

/**
 * The hashed block runtime id a creative record's block state carries, or zero when it has none.
 *
 * The record is vanilla's own: little-endian NBT whose `network_id` is the FNV-1a hash of the
 * state, the same function `BlockRuntimeIds` applies, so the two agree wherever the menu shows
 * a block in its default state. Where the menu shows another state (a piston faces up), or
 * where vanilla sends no block for a block-shaped item (a door, a bed, a hanging sign), the
 * record is what the client expects and a lookup by name is not.
 * @param {string | undefined} blockStates - the record as base64, or undefined for an item that is not a block.
 * @returns {number} the id to put on the wire.
 */
const blockRuntimeIdOf = (blockStates: string | undefined): number => {
    if (blockStates === undefined) return 0;

    const stream = new BinaryStream(Buffer.from(blockStates, 'base64'));
    return NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN).getNumber('network_id', 0);
};

/**
 * The creative menu, in the order the client shows it.
 *
 * Built once and kept, because it is both what `CreativeContentPacket` sends and what a
 * creative pick is resolved through: the client answers with the *position* of the entry it
 * clicked, so the two have to be the same list or a player gets an item they did not choose.
 *
 * An entry is shown when the **item table** names it, because that table is the registry the
 * client resolves against and a name missing from it is an item it cannot be handed. Having a
 * registered block or item class is not the test: a class is what gives an item behavior once
 * it is held, and requiring one kept all but three hundred odd entries out of the menu -
 * everything beyond the blocks this server implements.
 *
 * Matching once went by numeric id and damage, neither of which the creative list carries, so
 * nothing ever matched and the menu was empty from the day it was written.
 */
export class CreativeInventory {
    private static entries: CreativeEntry[] | null = null;
    private static groups: CreativeGroup[] | null = null;

    /**
     * The menu, each entry with the heading it sits under.
     * @param {CreativeRegistries} server - where the registered blocks and items come from.
     * @returns {CreativeEntry[]} the menu, in order.
     */
    public static getEntries(server: CreativeRegistries): CreativeEntry[] {
        if (CreativeInventory.entries) return CreativeInventory.entries;

        const registered = [...server.getBlockManager().getBlocks(), ...server.getItemManager().getItems()];

        // Indexed by name: scanning every block and item once per creative entry would be
        // 2000 passes over the registry.
        const byName = new Map<string, CreativeRegistryEntry>();
        for (const entry of registered) if (!byName.has(entry.getName())) byName.set(entry.getName(), entry);

        // The numeric id here is only the server's own handle on the item, and the fallback
        // for anything the item table does not name - which, past the guard below, is nothing.
        // What goes on the wire is the table's id, resolved by name, and the block state the
        // record carries rather than the one the name would resolve to.
        const toItem = (name: string, meta: number, blockStates: string | undefined) =>
            new Item({ id: byName.get(name)?.getId() ?? 0, name, meta, blockRuntimeId: blockRuntimeIdOf(blockStates) });

        const entries: CreativeEntry[] = [];
        for (const entry of CreativeItems) {
            if (!(entry.name in ItemTable)) continue; // The client has no id to resolve it to.

            entries.push({ item: toItem(entry.name, entry.meta ?? 0, entry.block_states), group: entry.group });
        }

        CreativeInventory.entries = entries;
        CreativeInventory.groups = CreativeGroups.map((group) => ({
            category: creativeCategoryOf(group.category),
            name: group.name,
            icon: toItem(group.icon, 0, group.icon_block_states)
        }));

        return entries;
    }

    /**
     * The headings of the menu, in the order the client draws them.
     *
     * Sent whole, every time, even where a group has no entry left under it: an entry names
     * its group by position, so dropping one would file the rest under the wrong heading.
     * @param {CreativeRegistries} server - where the registered blocks and items come from.
     * @returns {CreativeGroup[]} the headings, in order.
     */
    public static getGroups(server: CreativeRegistries): CreativeGroup[] {
        CreativeInventory.getEntries(server);
        return CreativeInventory.groups ?? [];
    }

    /**
     * The whole menu as plain items.
     * @param {CreativeRegistries} server - where the registered blocks and items come from.
     * @returns {Item[]} the menu, in order.
     */
    public static getItems(server: CreativeRegistries): Item[] {
        return CreativeInventory.getEntries(server).map((entry) => entry.item);
    }

    /**
     * The entry a creative pick names.
     *
     * Net ids are one-based, matching what `CreativeContentPacket` writes alongside each
     * entry.
     * @param {CreativeRegistries} server - where the registered blocks and items come from.
     * @param {number} netId - the id the client sent back.
     * @returns {Item | null} the item, or `null` if the id names nothing.
     */
    public static get(server: CreativeRegistries, netId: number): Item | null {
        return CreativeInventory.getEntries(server)[netId - 1]?.item ?? null;
    }

    /** Drops the built menu. Needed when a plugin changes what is registered, and by tests. */
    public static reset(): void {
        CreativeInventory.entries = null;
        CreativeInventory.groups = null;
    }
}

export default CreativeInventory;
