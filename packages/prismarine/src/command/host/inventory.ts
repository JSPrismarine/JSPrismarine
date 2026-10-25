/**
 * Writing one named inventory slot, which is what `/replaceitem` asks for.
 *
 * Bedrock names a slot in two parts, a group and an index inside it:
 * `/replaceitem entity @s slot.hotbar 3`. This server's inventories are one
 * flat 36-slot container plus two small ones for armor and the offhand, so the
 * group decides which container and the index is offset into it.
 *
 * Only the groups this server has a container for. `slot.enderchest`,
 * `slot.saddle`, `slot.chest`, `slot.equippable` and `slot.armor.body` name
 * things no entity here holds, and a write that landed nowhere would be worse
 * than a refusal.
 */
import type { DataTarget, ItemSlot } from '@jsprismarine/commands';

import type Server from '../../Server';
import ContainerEntry from '../../inventory/ContainerEntry';
import type Inventory from '../../inventory/Inventory';
import { carryOut, resolvePlayer, unsupported } from './support';

/** How many of the main container's slots are the hotbar. */
const HOTBAR_SIZE = 9;

/** The armor pieces, in the order the armor container holds them. */
const ARMOR_SLOTS: readonly string[] = ['slot.armor.head', 'slot.armor.chest', 'slot.armor.legs', 'slot.armor.feet'];

/** Which container a slot group names, and where in it the group starts. */
interface SlotTarget {
    readonly inventory: Inventory;
    readonly slot: number;
}

/**
 * Puts an item stack in one named slot.
 *
 * @param target - What `/replaceitem` addressed. Only an entity target is
 *   supported; a block target needs container block entities, which this
 *   server does not read items out of yet.
 * @param slot - The group name and the index inside it.
 * @param mode - `keep` leaves an occupied slot alone; the other two replace.
 * @returns How many items went in, which is zero when nothing changed.
 * @throws {CommandSyntaxException} When the slot group or the target has no
 *   container behind it.
 */
export const setItemSlot = (
    server: Server,
    target: DataTarget,
    slot: ItemSlot,
    item: string,
    count: number,
    mode: 'destroy' | 'keep' | 'replace' = 'replace'
): number => {
    if (target.kind !== 'entity') unsupported('addressable container block slots, which this');

    const player = resolvePlayer(server, target.entity);
    if (player === undefined) unsupported("item slots on anything but a player, which this server's inventories");

    const inventory = player.getInventory();
    const index = slot.index ?? 0;
    const armor = ARMOR_SLOTS.indexOf(slot.name);

    const resolved: SlotTarget | undefined =
        slot.name === 'slot.hotbar'
            ? index < HOTBAR_SIZE
                ? { inventory, slot: index }
                : undefined
            : slot.name === 'slot.inventory'
              ? index < inventory.getSlotCount() - HOTBAR_SIZE
                  ? { inventory, slot: HOTBAR_SIZE + index }
                  : undefined
              : slot.name === 'slot.weapon.mainhand'
                ? { inventory, slot: inventory.getHandSlotIndex() }
                : slot.name === 'slot.weapon.offhand'
                  ? { inventory: inventory.getOffhand(), slot: 0 }
                  : armor >= 0
                    ? { inventory: inventory.getArmor(), slot: armor }
                    : undefined;

    if (resolved === undefined) unsupported(`a '${slot.name}' slot, which this server`);
    if (mode === 'keep' && !resolved.inventory.isEmpty(resolved.slot)) return 0;

    const stack = server.getItemManager().getItem(item.includes(':') ? item : `minecraft:${item}`);
    if (stack === null) return 0;

    resolved.inventory.setItem(resolved.slot, new ContainerEntry({ item: stack, count }));
    return carryOut(player.getNetworkSession().sendInventory(), count);
};
