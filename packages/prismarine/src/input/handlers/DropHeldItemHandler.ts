import { Gametype } from '@jsprismarine/minecraft';

import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player pressed the drop key.
 *
 * One item leaves the stack in its hand, or the whole stack with `all`, and is thrown from the
 * player's eyes as any stack a player drops is. A spectator holds nothing it can drop, so its key
 * does nothing, as vanilla's does.
 * @javaSee ServerGamePacketListenerImpl.handlePlayerAction
 */
export default class DropHeldItemHandler implements IntentHandler<'dropHeldItem'> {
    public static readonly Kind = 'dropHeldItem';

    /** Takes the items out of the hand, tells the client what the slot holds now, and drops them. */
    public handle({ all }: Intent<'dropHeldItem'>, { session, step }: InputContext): undefined {
        const player = session.getPlayer();
        if (player.gamemode === Gametype.SPECTATOR) return;

        const inventory = player.getInventory();
        const slot = inventory.getHandSlot();
        const container = inventory.container('inventory');
        const held = container.get(slot);
        if (held === null || held.getAmount() <= 0) return;

        const count = all ? held.getAmount() : 1;
        container.set(slot, held.getAmount() > count ? held.withCount(held.getAmount() - count) : null);
        // A fresh stack, as the part split off a stack is: the hand keeps the stack's id.
        const dropped = held.withCount(count);
        dropped.stackNetworkId = 0;
        step.output(session.sendOwnSlot('inventory', slot));
        step.output(session.getWorld().dropFromPlayer(player, [dropped], session.runtimeId));
    }
}
