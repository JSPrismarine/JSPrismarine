/**
 * Reading and writing a mob's slots as drops, the plain shape a test writes its expectations in.
 *
 * A mob keeps `Item`s in its `EntityInventory` (`MobBody.inventory`). These turn a test's drops
 * into stacks of the running content and back, so a test states `{ identifier, count }` and not
 * how an item is built.
 */
import type { ContentItemDrop } from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';
import { dropOfItem, itemOfDrop } from '../inventory/persistence';
import type { MobBody } from '../entity/data/DataEntity';
import { identifiersIn } from '../entity/data/mobInventory';
import { equipmentDropsOf } from '../entity/data/persistence';
import type { MobEquipmentSet } from '../entity/equipment';
import { MOB_EQUIPMENT_SLOTS } from '../entity/equipment';

/** What a mob holds and wears, as drops, with an empty slot left out. */
export const equipmentOf = (body: MobBody): MobEquipmentSet => equipmentDropsOf(body.inventory);

/** Puts drops into a mob's equipment slots, and empties every slot `equipment` leaves out. */
export const equip = (body: MobBody, equipment: MobEquipmentSet, content?: ServerContent): void => {
    for (const slot of MOB_EQUIPMENT_SLOTS) {
        const drop = equipment[slot];
        body.inventory.setEquipment(slot, drop === undefined ? null : itemOfDrop(drop, content));
    }
};

/** Every slot of a mob's `inventory` container as a drop, undefined for an empty slot. */
export const containerOf = (body: MobBody): (ContentItemDrop | undefined)[] =>
    body.inventory
        .container('inventory')
        .items()
        .map((item) => dropOfItem(item));

/** Puts a drop into one slot of a mob's `inventory` container, or empties it. */
export const setContainerSlot = (
    body: MobBody,
    slot: number,
    drop: ContentItemDrop | undefined,
    content?: ServerContent
): void => {
    body.inventory.container('inventory').set(slot, drop === undefined ? null : itemOfDrop(drop, content));
};

/** What a mob carries in its `inventory` container, one identifier per item, in slot order. */
export const carriedOf = (body: MobBody): string[] => identifiersIn(body.inventory.container('inventory'));

/** Adds items to a mob's `inventory` container, one of each identifier given. */
export const give = (body: MobBody, identifiers: readonly string[], content?: ServerContent): void => {
    const container = body.inventory.container('inventory');
    for (const identifier of identifiers) {
        const item = itemOfDrop({ identifier, count: 1 }, content);
        if (item !== null) container.add(item);
    }
};

/** The identifier of what a mob holds in its main hand. */
export const heldOf = (body: MobBody): string | undefined => body.inventory.equipment('mainhand')?.getName();
