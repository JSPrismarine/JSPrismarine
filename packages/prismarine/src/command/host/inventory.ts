/**
 * Writing one named inventory slot, which is what `/replaceitem` asks for.
 *
 * Bedrock names a slot in two parts, a group and an index inside it:
 * `/replaceitem entity @s slot.hotbar 3`. This server's inventories are one
 * flat 36-slot container plus two small ones for armor and the offhand, so the
 * group decides which container and the index is offset into it.
 *
 * A block has one group, {@link BLOCK_CONTAINER_SLOT}, and its slots live in
 * the chunk's own block entity rather than in an inventory; see
 * {@link import('./containers')}. So `/replaceitem block 0 70 0 slot.container
 * 3 diamond` puts a diamond in the fourth slot of the chest standing there,
 * and the chest still holds it after the world is saved and read back.
 *
 * Only the groups this server has somewhere to put something. `slot.enderchest`,
 * `slot.saddle`, `slot.chest`, `slot.equippable` and `slot.armor.body` name
 * things no entity here holds, and a write that landed nowhere would be worse
 * than a refusal.
 */
import type { DataTarget, ItemSlot } from '@jsprismarine/commands';

import type Server from '../../Server';
import ContainerEntry from '../../inventory/ContainerEntry';
import { itemFromContent } from '../../item/itemFromContent';
import type Inventory from '../../inventory/Inventory';
import { blockContainerAt } from './containers';
import { blockPositionOf, carryOut, refuse, resolvePlayer, unsupported, worldOf } from './support';

/** How many of the main container's slots are the hotbar. */
const HOTBAR_SIZE = 9;

/**
 * The armor pieces, in the order the armor container holds them.
 *
 * The index into this list is also what `slot.armor <n>` means, which is
 * Bedrock's other spelling of the same four: the enum carries both the named
 * form and the indexed one, and the client sends whichever the operator typed.
 */
const ARMOR_SLOTS: readonly string[] = ['slot.armor.head', 'slot.armor.chest', 'slot.armor.legs', 'slot.armor.feet'];

/**
 * The one group a block has, as Mojang's `BlockEquipmentSlot` enum spells it.
 *
 * That enum holds exactly this one value, which is why a block target needs no
 * table: whatever the block stores, the client names it `slot.container`.
 */
export const BLOCK_CONTAINER_SLOT = 'slot.container';

/** Which container a slot group names, and where in it the group starts. */
interface SlotTarget {
    readonly inventory: Inventory;
    readonly slot: number;
}

/** The item a command named, or null when no loaded pack declares it. */
const stackOf = (server: Server, item: string) =>
    itemFromContent(item.includes(':') ? item : `minecraft:${item}`, server.getContent());

/**
 * Puts a stack into one slot of the container block at a position.
 *
 * @returns How many items went in, which is zero when the slot was kept.
 * @throws {CommandSyntaxException} When nothing there stores slots, or when
 *   the slot is outside the ones the block has.
 */
const setBlockSlot = (
    server: Server,
    target: Extract<DataTarget, { kind: 'block' }>,
    slot: ItemSlot,
    item: string,
    count: number,
    mode: 'destroy' | 'keep' | 'replace'
): number => {
    const world = worldOf(server, target.dimension);
    const at = blockPositionOf(target.position);
    const container = blockContainerAt(server, world, at);
    if (container === undefined) refuse(`There is no container at ${at.getX()} ${at.getY()} ${at.getZ()}`);

    if (slot.name !== BLOCK_CONTAINER_SLOT) unsupported(`a '${slot.name}' slot on a block, which Bedrock`);

    const index = slot.index ?? 0;
    if (index >= container.size) {
        refuse(`That block has ${container.size} slots, so slot ${index} is not one of them`);
    }
    if (mode === 'keep' && container.get(index) !== undefined) return 0;

    const stack = stackOf(server, item);
    if (stack === null) return 0;

    // Air empties the slot rather than filling it with a stack of nothing,
    // which is how a block entity record spells an empty slot and how Java
    // clears one.
    container.set(
        index,
        stack.getName() === 'minecraft:air' ? undefined : { identifier: stack.getName(), count, meta: stack.getMeta() }
    );
    container.commit();
    return count;
};

/**
 * Puts an item stack in one named slot.
 *
 * @param target - What `/replaceitem` or `/loot replace` addressed. A storage
 *   target needs the NBT storage this server has no model for.
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
    if (target.kind === 'block') return setBlockSlot(server, target, slot, item, count, mode);
    if (target.kind !== 'entity') unsupported('NBT storage, which this');

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
                  : slot.name === 'slot.enderchest'
                    ? index < inventory.getEnderChest().getSlotCount()
                        ? { inventory: inventory.getEnderChest(), slot: index }
                        : undefined
                    : slot.name === 'slot.armor'
                      ? index < ARMOR_SLOTS.length
                          ? { inventory: inventory.getArmor(), slot: index }
                          : undefined
                      : armor >= 0
                        ? { inventory: inventory.getArmor(), slot: armor }
                        : undefined;

    if (resolved === undefined) unsupported(`a '${slot.name}' slot, which this server`);
    if (mode === 'keep' && !resolved.inventory.isEmpty(resolved.slot)) return 0;

    const stack = stackOf(server, item);
    if (stack === null) return 0;

    resolved.inventory.setItem(resolved.slot, new ContainerEntry({ item: stack, count }));
    return carryOut(player.getNetworkSession().sendInventory(), count);
};
