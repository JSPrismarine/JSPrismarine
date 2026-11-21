import { describe, expect, it } from 'vitest';

import type { EquippableSlot } from '../entity/data/equippable';
import { EntityInventory, PLAYER_LAYOUT, mobLayout } from './EntityInventory';
import type { SlotHolder } from './slotAddress';
import { javaSlotIds, resolveSlotName } from './slotAddress';

const player = (): SlotHolder => ({ kind: 'player', inventory: new EntityInventory(PLAYER_LAYOUT) });

const mob = (size = 0, containerType?: string, equippable: readonly EquippableSlot[] = []): SlotHolder => ({
    kind: 'mob',
    inventory: new EntityInventory(mobLayout(size)),
    containerType,
    equippable
});

/** A tamed horse: saddle in slot 0 and armor in slot 1, as Bedrock's `minecraft:equippable` lists them. */
const horse = () =>
    mob(2, 'horse', [
        { slot: 0, acceptedItems: ['saddle'] },
        { slot: 1, acceptedItems: ['horsearmoriron', 'horsearmordiamond'] }
    ]);

/** A tamed llama at full strength: sixteen slots, its carpet in slot 1 and the rest its chest. */
const llama = () => mob(16, 'horse', [{ slot: 1, acceptedItems: ['carpet'] }]);

const slotsOf = (name: string, holder: SlotHolder, index?: number) => {
    const resolved = resolveSlotName({ name, ...(index === undefined ? {} : { index }) }, holder);
    return resolved.ok ? resolved.slots : resolved.refusal;
};

describe("Java's slot names", () => {
    it('number the slots the way SlotRanges does', () => {
        expect(javaSlotIds('container.0')).toEqual([0]);
        expect(javaSlotIds('inventory.0')).toEqual([9]);
        expect(javaSlotIds('enderchest.26')).toEqual([226]);
        expect(javaSlotIds('armor.feet')).toEqual([100]);
        expect(javaSlotIds('armor.*')).toEqual([103, 102, 101, 100, 105]);
        expect(javaSlotIds('container.54')).toBeUndefined();
        expect(javaSlotIds('container.05')).toBeUndefined();
    });

    it('reads container.0 on a player as hotbar slot 0, not the first slot past the hotbar', () => {
        expect(slotsOf('container.0', player())).toEqual([{ container: 'inventory', slot: 0 }]);
        expect(slotsOf('hotbar.0', player())).toEqual([{ container: 'inventory', slot: 0 }]);
        expect(slotsOf('inventory.0', player())).toEqual([{ container: 'inventory', slot: 9 }]);
    });

    it("reads a player's main hand as the hotbar slot it points at", () => {
        const holder = player();
        if (holder.kind !== 'block') holder.inventory.setHandSlot(4);

        expect(slotsOf('weapon.mainhand', holder)).toEqual([{ container: 'inventory', slot: 4 }]);
        expect(slotsOf('weapon.offhand', holder)).toEqual([{ container: 'offhand', slot: 0 }]);
        expect(slotsOf('player.cursor', holder)).toEqual([{ container: 'cursor', slot: 0 }]);
    });

    it("reads a player's ender chest", () => {
        expect(slotsOf('enderchest.3', player())).toEqual([{ container: 'ender_chest', slot: 3 }]);
    });

    it('leaves out the slots of a wildcard the holder lacks', () => {
        expect(slotsOf('container.*', player())).toHaveLength(36);
        // A player wears no body armor, so armor.* is the four pieces.
        expect(slotsOf('armor.*', player())).toEqual([
            { container: 'armor', slot: 0 },
            { container: 'armor', slot: 1 },
            { container: 'armor', slot: 2 },
            { container: 'armor', slot: 3 }
        ]);
        expect(slotsOf('armor.*', mob())).toHaveLength(5);
        expect(slotsOf('container.*', { kind: 'block', size: 27 })).toHaveLength(27);
        expect(slotsOf('weapon.*', mob())).toEqual([
            { container: 'mainhand', slot: 0 },
            { container: 'offhand', slot: 0 }
        ]);
    });

    it("reads a zombie's head", () => {
        expect(slotsOf('armor.head', mob())).toEqual([{ container: 'armor', slot: 0 }]);
    });

    it("reads a horse's saddle and puts its armor in the container slot its equippable names", () => {
        expect(slotsOf('saddle', horse())).toEqual([{ container: 'inventory', slot: 0 }]);
        expect(slotsOf('horse.saddle', horse())).toEqual([{ container: 'inventory', slot: 0 }]);
        expect(slotsOf('armor.body', horse())).toEqual([{ container: 'inventory', slot: 1, alias: 'body' }]);
        // A horse has no chest, so its two slots are both claimed.
        expect(slotsOf('horse.0', horse())).toBe('The target does not have slot horse.0');
    });

    it("reads a llama's chest past its carpet", () => {
        expect(slotsOf('horse.0', llama())).toEqual([{ container: 'inventory', slot: 0 }]);
        expect(slotsOf('horse.1', llama())).toEqual([{ container: 'inventory', slot: 2 }]);
        expect(slotsOf('horse.*', llama())).toHaveLength(15);
        expect(slotsOf('saddle', llama())).toBe('The target does not have slot saddle');
    });

    it("reads a villager's pocket and a chest minecart's container", () => {
        const villager = mob(8, 'inventory');
        expect(slotsOf('mob.inventory.2', villager)).toEqual([{ container: 'inventory', slot: 2 }]);
        expect(slotsOf('villager.2', villager)).toEqual([{ container: 'inventory', slot: 2 }]);
        expect(slotsOf('container.2', villager)).toBe('The target does not have slot container.2');

        expect(slotsOf('container.26', mob(27, 'minecart_chest'))).toEqual([{ container: 'inventory', slot: 26 }]);
    });

    it('refuses an unknown name, a wildcard where one slot is wanted, and a slot kept out of reach', () => {
        expect(slotsOf('armor.tail', mob())).toBe("Unknown slot 'armor.tail'");
        expect(resolveSlotName({ name: 'container.*' }, player(), { single: true })).toEqual({
            ok: false,
            refusal: "Only single slots allowed: got 'container.*'"
        });
        expect(slotsOf('player.crafting.0', player())).toBe(
            'Slot player.crafting.0 is not one this server can reach yet'
        );
        expect(resolveSlotName({ name: 'enderchest.0' }, mob(), { role: 'source' })).toEqual({
            ok: false,
            refusal: 'The source does not have slot enderchest.0'
        });
    });

    it('walks on past the named slot, as /loot replace with a count does', () => {
        // hotbar.8 and one more is inventory.0, Java's slot 9.
        expect(resolveSlotName({ name: 'hotbar.8' }, player(), { offset: 1 })).toEqual({
            ok: true,
            slots: [{ container: 'inventory', slot: 9 }]
        });
    });
});

describe("Bedrock's slot groups", () => {
    it('read a group and an index', () => {
        expect(slotsOf('slot.hotbar', player(), 3)).toEqual([{ container: 'inventory', slot: 3 }]);
        expect(slotsOf('slot.inventory', player(), 0)).toEqual([{ container: 'inventory', slot: 9 }]);
        expect(slotsOf('slot.armor', player(), 1)).toEqual([{ container: 'armor', slot: 1 }]);
        expect(slotsOf('slot.enderchest', player(), 26)).toEqual([{ container: 'ender_chest', slot: 26 }]);
        expect(slotsOf('slot.armor.head', mob(), 0)).toEqual([{ container: 'armor', slot: 0 }]);
        expect(slotsOf('slot.container', { kind: 'block', size: 5 }, 4)).toEqual([{ container: 'block', slot: 4 }]);
    });

    it("read a mount's saddle, chest and equippable slots", () => {
        expect(slotsOf('slot.saddle', horse(), 0)).toEqual([{ container: 'inventory', slot: 0 }]);
        expect(slotsOf('slot.armor.body', horse(), 0)).toEqual([{ container: 'inventory', slot: 1, alias: 'body' }]);
        expect(slotsOf('slot.equippable', horse(), 1)).toEqual([{ container: 'inventory', slot: 1 }]);
        expect(slotsOf('slot.chest', llama(), 1)).toEqual([{ container: 'inventory', slot: 2 }]);
    });

    it('refuse an index outside the group with the range it takes, as Bedrock words it', () => {
        expect(slotsOf('slot.hotbar', player(), 9)).toBe('Could not replace slot 9, must be a value between 0 and 8.');
        expect(slotsOf('slot.armor.head', mob(), 1)).toBe('Could not replace slot 1, must be a value between 0 and 0.');
    });

    it('refuse a group the holder does not have in a sentence', () => {
        expect(slotsOf('slot.saddle', player(), 0)).toBe('A player has no slot.saddle slots');
        expect(slotsOf('slot.enderchest', mob(), 0)).toBe('That entity has no slot.enderchest slots');
        expect(slotsOf('slot.hotbar', { kind: 'block', size: 27 }, 0)).toBe('That block has no slot.hotbar slots');
    });
});
