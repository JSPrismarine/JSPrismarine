import {
    creative_groups as CreativeGroups,
    creativeitems as CreativeItems,
    item_table as ItemTable
} from '@jsprismarine/bedrock-data';
import { beforeEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { CreativeItemCategory } from '../network/packet/CreativeContentPacket';
import CreativeInventory from './CreativeInventory';

/**
 * The `network_id` vanilla recorded in a creative block state, read off the raw bytes rather
 * than through the NBT reader the code under test uses.
 */
const vanillaBlockId = (blockStates: string): number => {
    const bytes = Buffer.from(blockStates, 'base64');
    return bytes.readInt32LE(bytes.indexOf('network_id') + 'network_id'.length);
};

describe('CreativeInventory', () => {
    /** A fresh menu per case, which is what owning one rather than sharing a static buys. */
    let menu: CreativeInventory;
    beforeEach(() => {
        menu = new CreativeInventory();
    });

    it('shows every creative entry the item table still names, with nothing registered', () => {
        // An entry the table has never heard of is left out on purpose - that is the guard
        // working, not a menu with a hole in it - and this asserts the guard drops exactly
        // what it should and nothing more.
        const nameable = CreativeItems.filter((entry) => entry.name in ItemTable);

        expect(menu.getItems()).toHaveLength(nameable.length);
    });

    it('leaves out nothing, because both files describe the same version', () => {
        // The creative list and the item table used to come from different releases, and the
        // guard above dropped `minecraft:chain` for it. They now agree name for name, so the
        // guard has nothing left to do - and a name reappearing here is a version drift.
        const dropped = CreativeItems.map((entry) => entry.name).filter((name) => !(name in ItemTable));

        expect(dropped).toEqual([]);
    });

    it('files every entry under a group the client will have been sent', () => {
        // An entry names its group by position, so a group index past the end of the list is
        // a menu the client cannot draw.
        const groups = menu.getGroups();

        expect(groups).toHaveLength(CreativeGroups.length);
        for (const entry of menu.getEntries()) {
            expect(groups[entry.group]).toBeDefined();
        }
    });

    it('puts every group in a tab the client knows', () => {
        // Four tabs are used by vanilla. Anything else would mean a heading the client files
        // under the catch-all, which is the fallback working rather than the data being read.
        const tabs = new Set(menu.getGroups().map((group) => group.category));

        expect([...tabs].sort()).toEqual([
            CreativeItemCategory.CONSTRUCTION,
            CreativeItemCategory.NATURE,
            CreativeItemCategory.EQUIPMENT,
            CreativeItemCategory.ITEMS
        ]);
    });

    it('gives every group an icon the client can resolve', () => {
        // 88 of the 124 groups carry a heading. The other 36 are anonymous: vanilla draws
        // loose runs of items between its headings, and a group with no name and an air icon
        // is how it says so.
        const groups = menu.getGroups();

        expect(groups.filter((group) => group.name !== '').length).toBeGreaterThan(0);
        for (const group of groups) {
            expect(ItemTable[group.icon.getName()]).toBeDefined();
            if (group.name === '') expect(group.icon.getName()).toBe('minecraft:air');
        }
    });

    it('gives every entry an id the client can resolve', () => {
        // The client builds its registry from the item table sent at StartGame, so an item
        // whose id is not in that table is one it has been shown and cannot look up.
        const ids = new Set(Object.values(ItemTable).map((entry) => entry.runtime_id));

        for (const item of menu.getItems()) {
            expect(ids.has(item.getNetworkId())).toBe(true);
        }
    });

    it('never falls back to an unrelated internal id', () => {
        // Half the menu used to. An entry the item table could not name kept the numeric id
        // of whichever block class happened to share its name, so all six planks went out as
        // 5 and all the stained glass as 241: 308 entries collapsing onto 157 ids, each one a
        // duplicate of the wrong item.
        const items = menu.getItems();

        for (const item of items) {
            expect(item.getNetworkId()).toBe(ItemTable[item.getName()]!.runtime_id);
        }
    });

    it('hashes a default block state to the number vanilla recorded for it', () => {
        // The creative data carries vanilla's hashed ids, and `StartGamePacket` announces that
        // this server's ids are hashes too. The two schemes have to be the same function, or
        // the menu and the chunk palette would call the same block by different numbers.
        const planks = CreativeItems.find((entry) => entry.name === 'minecraft:oak_planks');

        expect(planks?.block_states).toBeDefined();
        expect(BlockRuntimeIds.getByName('minecraft:oak_planks')).toBe(vanillaBlockId(planks!.block_states!));
    });

    it('sends each block entry with the block state vanilla shows', () => {
        const shown = CreativeItems.filter((entry) => entry.name in ItemTable);
        const items = menu.getItems();

        expect(items).toHaveLength(shown.length);
        for (const [i, entry] of shown.entries()) {
            const expected = entry.block_states === undefined ? 0 : vanillaBlockId(entry.block_states);
            expect(items[i]!.getBlockRuntimeId()).toBe(expected);
        }
    });

    it('sends the state the menu shows, not the default, where the two differ', () => {
        // A piston faces up in the menu. Resolving its name gave the default state, which is
        // a different hash, and so a different block as far as the client could tell.
        const piston = menu.getItems().find((item) => item.getName() === 'minecraft:piston');

        expect(piston).toBeDefined();
        expect(piston!.getBlockRuntimeId()).not.toBe(BlockRuntimeIds.getByName('minecraft:piston'));
    });

    it('sends no block for the item form of a door, as vanilla does', () => {
        // The server has a block schema under the door's name, which is what made a lookup by
        // name put a block id on an item vanilla sends with none.
        const door = menu.getItems().find((item) => item.getName() === 'minecraft:cherry_door');

        expect(BlockRuntimeIds.tryGetByName('minecraft:cherry_door')).not.toBeNull();
        expect(door?.getBlockRuntimeId()).toBe(0);
    });

    it('gives every group icon the block state vanilla draws', () => {
        const groups = menu.getGroups();

        for (const [i, group] of CreativeGroups.entries()) {
            const expected = group.icon_block_states === undefined ? 0 : vanillaBlockId(group.icon_block_states);
            expect(groups[i]!.icon.getBlockRuntimeId()).toBe(expected);
        }
    });

    it('resolves a pick back to the entry that was shown', () => {
        // Net ids are positions in this list, so the list the client was sent and the list a
        // pick is read against have to be the same one.
        const items = menu.getItems();

        expect(menu.get(1)).toBe(items[0]);
        expect(menu.get(items.length)).toBe(items.at(-1));
        expect(menu.get(items.length + 1)).toBeNull();
    });

    it('builds a separate menu for each server instance', () => {
        const other = new CreativeInventory();

        expect(other.getEntries()).not.toBe(menu.getEntries());
    });
});
