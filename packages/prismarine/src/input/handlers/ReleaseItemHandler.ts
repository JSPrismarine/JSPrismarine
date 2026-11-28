import { BOW, loose } from '../../entity/Archery';
import { endItemUse } from '../../item/itemUse';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player let go of the item it was using, which for a bow means the arrow leaves.
 *
 * The charge is measured rather than sent; see `UseItemHandler` for why. The arrow is not taken
 * out of the inventory and the bow is not worn down. Both need the same thing, telling the
 * client that a slot has changed, and both wait for the inventory work where that lives,
 * because a server that silently disagrees with the client about what is in a player's hand is
 * worse than one that has not got round to the accounting.
 */
export default class ReleaseItemHandler implements IntentHandler<'releaseItem'> {
    public static readonly Kind = 'releaseItem';

    /** Ends the use, and looses an arrow for a bow let go of. */
    public handle({ action }: Intent<'releaseItem'>, { session, step }: InputContext): undefined {
        const player = session.getPlayer();
        // Letting go of the button ends a meal that has not finished.
        session.inputs().cancelPlayerMeal(player);
        // The draw's clock, which the store player keeps.
        const drawn = player.takeItemUseTicks(step.tick);
        const bow = player.getInventory().equipment('mainhand')?.getName() === BOW;
        const looses = bow && action === 'release';
        endItemUse(session, looses ? 'release' : 'stop', step.tick);
        if (!looses) return;

        // The arrow and the bow's sound are written in this input's unit.
        const shooter = session.getActor();
        if (shooter !== undefined) loose(shooter, drawn);
    }
}
