import { creativeitems as CreativeItems, item_table as ItemTable } from '@jsprismarine/bedrock-data';
import { beforeEach, describe, expect, it } from 'vitest';

import CreativeInventory from './CreativeInventory';

/**
 * A server that has registered nothing at all.
 *
 * Deliberately empty, because that is the whole point of what changed: the menu used to be
 * the intersection of the creative list and the blocks and items this server implements
 * classes for, which meant 1611 of the 1919 entries never reached the client. A class is what
 * gives an item behaviour once it is held; it is not what makes the client able to show it.
 */
const emptyServer = {
    getBlockManager: () => ({ getBlocks: () => [] }),
    getItemManager: () => ({ getItems: () => [] })
} as any;

describe('CreativeInventory', () => {
    beforeEach(() => CreativeInventory.reset());

    it('shows every creative entry the item table still names, with nothing registered', () => {
        // Not simply `CreativeItems.length`. The two files no longer come from the same
        // version: the item table is captured from a 1.26.40 server, the creative list still
        // comes from the submodule and stops at 1.21.40. An entry the table has never heard of
        // is left out on purpose - that is the guard working, not a menu with a hole in it -
        // and this asserts the guard drops exactly what it should and nothing more.
        const nameable = (CreativeItems as Array<{ name: string }>).filter((entry) => entry.name in ItemTable);

        expect(CreativeInventory.getItems(emptyServer)).toHaveLength(nameable.length);
    });

    it('leaves out only entries the item table has stopped naming', () => {
        // One, at the time of writing: `minecraft:chain`, which 1.26.40 renamed to
        // `minecraft:iron_chain` when copper chains arrived. Worth naming rather than counting,
        // so that a second one appearing is a test failure instead of a smaller menu.
        const dropped = (CreativeItems as Array<{ name: string }>)
            .map((entry) => entry.name)
            .filter((name) => !(name in ItemTable));

        expect(dropped).toEqual(['minecraft:chain']);
    });

    it('gives every entry an id the client can resolve', () => {
        // The client builds its registry from the item table sent at StartGame, so an item
        // whose id is not in that table is one it has been shown and cannot look up.
        const ids = new Set(Object.values(ItemTable).map((entry) => entry.runtime_id));

        for (const item of CreativeInventory.getItems(emptyServer)) {
            expect(ids.has(item.getNetworkId())).toBe(true);
        }
    });

    it('never falls back to an unrelated internal id', () => {
        // Half the menu used to. An entry the item table could not name kept the numeric id
        // of whichever block class happened to share its name, so all six planks went out as
        // 5 and all the stained glass as 241: 308 entries collapsing onto 157 ids, each one a
        // duplicate of the wrong item.
        const items = CreativeInventory.getItems(emptyServer);

        for (const item of items) {
            expect(item.getNetworkId()).toBe(ItemTable[item.getName()]!.runtime_id);
        }
    });

    it('resolves a pick back to the entry that was shown', () => {
        // Net ids are positions in this list, so the list the client was sent and the list a
        // pick is read against have to be the same one.
        const items = CreativeInventory.getItems(emptyServer);

        expect(CreativeInventory.get(emptyServer, 1)).toBe(items[0]);
        expect(CreativeInventory.get(emptyServer, items.length)).toBe(items.at(-1));
        expect(CreativeInventory.get(emptyServer, items.length + 1)).toBeNull();
    });
});
