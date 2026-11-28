/** A player's inventory as the plain stacks a presenter of another edition shows. */
import type HumanInventory from '../../inventory/HumanInventory';
import type { ItemContainer } from '../../inventory/ItemContainer';
import type { Item } from '../../item/Item';
import { hasStackComponents } from '../../item/stackComponents';
import type { ViewableEquipment } from '../../entity/predicateView';
import type { ShownEquipment, ShownInventory, ShownStack } from './SessionPresenter';

/**
 * A stack as plain data, or null for an empty slot.
 * @param item - The slot's item with its count, or null.
 */
export const shownStackOf = (item: Item | null): ShownStack | null => {
    if (item === null || item.getName() === 'minecraft:air' || item.getAmount() <= 0) return null;
    const customName = item.getCustomName();
    const lore = item.getLore();
    const damage = item.getMaxDurability() > 0 ? item.getMaxDurability() - item.getDurability() : 0;
    const enchantments = item.getEnchantments();
    const components = item.getComponents();
    return {
        name: item.getName(),
        count: item.getAmount(),
        ...(customName === undefined ? {} : { customName }),
        ...(lore.length === 0 ? {} : { lore }),
        ...(damage > 0 ? { damage } : {}),
        ...(enchantments.size === 0 ? {} : { enchantments }),
        ...(hasStackComponents(components) ? { components } : {})
    };
};

/** Every slot of a container, in order. */
const slotsOf = (container: ItemContainer): (ShownStack | null)[] => container.items().map(shownStackOf);

/**
 * A player's inventory as plain stacks.
 * @param inventory - The player's inventory.
 */
export const shownInventoryOf = (inventory: HumanInventory): ShownInventory => ({
    inventory: slotsOf(inventory.container('inventory')),
    armor: slotsOf(inventory.container('armor')),
    offhand: shownStackOf(inventory.equipment('offhand')),
    handSlot: inventory.getHandSlot()
});

/**
 * What an entity holds and wears, as plain stacks; an empty slot is left out.
 * @param equipment - The entity's equipment, as replication reads it.
 */
export const shownEquipmentOf = (equipment: ViewableEquipment): ShownEquipment => {
    const shown: Record<string, ShownStack> = {};
    for (const [slot, item] of Object.entries(equipment)) {
        const stack = item === undefined ? null : shownStackOf(item);
        if (stack !== null) shown[slot] = stack;
    }
    return shown;
};
