/**
 * A server mob's slots as drops, the plain shape the scenarios compare with Java's.
 *
 * The server keeps item stacks in each mob's inventory (`MobBody.inventory`); these turn the
 * scenarios' drops into stacks of the running content and back.
 */
import type { ContentItemDrop } from '@jsprismarine/prismarine/content/world/adapter';
import type { MobBody } from '@jsprismarine/prismarine/entity/data/DataEntity';
import { MOB_EQUIPMENT_SLOTS } from '@jsprismarine/prismarine/entity/equipment';
import type { MobEquipmentSet, MobEquipmentSlot } from '@jsprismarine/prismarine/entity/equipment';
import { dropOfItem, itemOfDrop } from '@jsprismarine/prismarine/inventory/persistence';

import { serverContent } from '../serverStack.ts';

/** What a mob holds and wears, as drops, with an empty slot left out. */
export const equipmentOf = (body: MobBody): MobEquipmentSet => {
    const equipment: Partial<Record<MobEquipmentSlot, ContentItemDrop>> = {};
    for (const slot of MOB_EQUIPMENT_SLOTS) {
        const drop = dropOfItem(body.inventory.equipment(slot));
        if (drop !== undefined) equipment[slot] = drop;
    }
    return equipment;
};

/** Puts drops into a mob's equipment slots, and empties every slot `equipment` leaves out. */
export const equip = (body: MobBody, equipment: MobEquipmentSet): void => {
    for (const slot of MOB_EQUIPMENT_SLOTS) {
        const drop = equipment[slot];
        body.inventory.setEquipment(slot, drop === undefined ? null : itemOfDrop(drop, serverContent()));
    }
};

/** Puts one of an item in a mob's main hand, or empties it for undefined. */
export const hold = (body: MobBody, identifier: string | undefined): void => {
    body.inventory.setEquipment(
        'mainhand',
        identifier === undefined ? null : itemOfDrop({ identifier, count: 1 }, serverContent())
    );
};

/** The identifier of what a mob holds in its main hand. */
export const heldOf = (body: MobBody): string | undefined => body.inventory.equipment('mainhand')?.getName();

/** Every stack in a mob's `inventory` container, as drops, with the empty slots left out. */
export const containerOf = (body: MobBody): ContentItemDrop[] =>
    body.inventory
        .container('inventory')
        .stacks()
        .flatMap((item) => dropOfItem(item) ?? []);
