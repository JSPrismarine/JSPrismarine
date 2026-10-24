import { creativeitems as CreativeItems, item_table as ItemTable } from '@jsprismarine/bedrock-data';
import { Item } from '../item/Item';

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
 * The creative menu, in the order the client shows it.
 *
 * Built once and kept, because it is both what `CreativeContentPacket` sends and what a
 * creative pick is resolved through: the client answers with the *position* of the entry it
 * clicked, so the two have to be the same list or a player gets an item they did not choose.
 *
 * An entry is shown when the **item table** names it, because that table is the registry the
 * client resolves against and a name missing from it is an item it cannot be handed. Having a
 * registered block or item class is not the test: a class is what gives an item behavior once
 * it is held, and requiring one kept 1611 of the 1919 entries out of the menu - everything
 * beyond the three hundred odd blocks this server implements.
 *
 * Matching once went by numeric id and damage, neither of which the creative list carries, so
 * nothing ever matched and the menu was empty from the day it was written.
 */
export class CreativeInventory {
    private static items: Item[] | null = null;

    /**
     * The whole menu.
     * @param {CreativeRegistries} server - where the registered blocks and items come from.
     * @returns {Item[]} the menu, in order.
     */
    public static getItems(server: CreativeRegistries): Item[] {
        if (CreativeInventory.items) return CreativeInventory.items;

        const registered = [...server.getBlockManager().getBlocks(), ...server.getItemManager().getItems()];

        // Indexed by name: scanning every block and item once per creative entry would be
        // 1900 passes over the registry.
        const byName = new Map<string, CreativeRegistryEntry>();
        for (const entry of registered) if (!byName.has(entry.getName())) byName.set(entry.getName(), entry);

        const items: Item[] = [];
        for (const entry of CreativeItems) {
            if (!(entry.name in ItemTable)) continue; // The client has no id to resolve it to.

            const registeredEntry = byName.get(entry.name);

            // The numeric id here is only the server's own handle on the item, and the
            // fallback for anything the item table does not name - which, past the guard
            // above, is nothing. What goes on the wire is the table's id, resolved by name.
            items.push(new Item({ id: registeredEntry?.getId() ?? 0, name: entry.name, meta: entry.meta ?? 0 }));
        }

        CreativeInventory.items = items;
        return items;
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
        return CreativeInventory.getItems(server)[netId - 1] ?? null;
    }

    /** Drops the built list. Needed when a plugin changes what is registered, and by tests. */
    public static reset(): void {
        CreativeInventory.items = null;
    }
}

export default CreativeInventory;
