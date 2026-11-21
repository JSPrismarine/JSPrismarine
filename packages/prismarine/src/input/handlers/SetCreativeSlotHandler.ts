import { Gametype } from '@jsprismarine/minecraft';

import ContainerEntry from '../../inventory/ContainerEntry';
import { itemFromContent } from '../../item/itemFromContent';
import { maxStackSizeOf } from '../../item/Item';
import type { InputContext } from '../../network/handler/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

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
        const inventory = session.getPlayer().getInventory();
        const target =
            container === 'armor' ? inventory.getArmor() : container === 'offhand' ? inventory.getOffhand() : inventory;
        if (!Number.isInteger(slot) || slot < 0 || slot >= target.getSlotCount()) return;

        const stack = item === null ? null : itemFromContent(item.name, services.content);
        if (session.getPlayer().gamemode !== Gametype.CREATIVE || (item !== null && stack === null)) {
            log.verbose(
                `Refused a creative slot from ${session.identity.name}: not creative, or no item ${item?.name}`
            );
            step.output(session.sendOwnSlot(container, slot));
            return;
        }

        if (item === null || stack === null) {
            target.removeItem(slot);
            return;
        }
        const count = Math.min(Math.max(1, item.count), maxStackSizeOf(item.name, services.content));
        target.setItem(slot, new ContainerEntry({ item: stack, count }));
    }
}
