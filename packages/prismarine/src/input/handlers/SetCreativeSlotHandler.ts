import { Gametype } from '@jsprismarine/minecraft';

import type { Item } from '../../item/Item';
import { itemFromContent } from '../../item/itemFromContent';
import { maxStackSizeOf } from '../../item/Item';
import type { InputContext } from '../../player/context/HandlerContext';
import type { ShownStack } from '../../player/presenter/SessionPresenter';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * A stack with what the client's stack changes from its item: its name, lore, enchantments, spent
 * durability, at most all of it, and its other components.
 */
const stackWith = (stack: Item, { customName, lore, enchantments, damage, components }: ShownStack): Item => {
    let shaped = stack;
    if (customName !== undefined || (lore !== undefined && lore.length > 0))
        shaped = shaped.withDisplay(customName, lore);
    if (enchantments !== undefined && enchantments.size > 0) shaped = shaped.withEnchantments(enchantments);
    const max = shaped.getMaxDurability();
    if (damage !== undefined && max > 0) shaped = shaped.withDurability(max - Math.min(Math.max(0, damage), max));
    if (components !== undefined) shaped = shaped.withComponents(components);
    return shaped;
};

/**
 * A creative player set a slot of its own inventory.
 *
 * A creative client takes what it likes from the creative inventory and says only where it put
 * it, so the server believes it from a creative player alone. Anyone else is told what the slot
 * really holds, which puts back what their client already showed.
 */
export default class SetCreativeSlotHandler implements IntentHandler<'setCreativeSlot'> {
    public static readonly Kind = 'setCreativeSlot';

    /** Writes the slot, clamping the count to the item's stack size, or puts the client's slot back. */
    public handle(
        { container, slot, item }: Intent<'setCreativeSlot'>,
        { session, log, services, step }: InputContext
    ): undefined {
        const target = session.getPlayer().getInventory().container(container);
        if (!target.has(slot)) return;

        const stack = item === null ? null : itemFromContent(item.name, services.content);
        if (session.getPlayer().gamemode !== Gametype.CREATIVE || (item !== null && stack === null)) {
            log.verbose(
                `Refused a creative slot from ${session.identity.name}: not creative, or no item ${item?.name}`
            );
            step.output(session.sendOwnSlot(container, slot));
            return;
        }

        if (item === null || stack === null) {
            target.set(slot, null);
            return;
        }
        const count = Math.min(Math.max(1, item.count), maxStackSizeOf(item.name, services.content));
        target.set(slot, stackWith(stack.withCount(count), item));
    }
}
