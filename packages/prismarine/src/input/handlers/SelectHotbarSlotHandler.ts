import { blockMiningOf, playerMiningOf } from '../../world/BlockMining';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player moved its hand to a hotbar slot.
 *
 * What the server says is in the slot reaches the players that have the sender on screen with
 * the next tick's sync, from the logged hand slot, with the armor and the off hand.
 */
export default class SelectHotbarSlotHandler implements IntentHandler<'selectHotbarSlot'> {
    public static readonly Kind = 'selectHotbarSlot';

    /**
     * Moves the hand, and starts a block being mined over for the new tool.
     *
     * A block being mined was timed for the tool held when mining began. A switch starts the
     * mining over for the new tool, as a Bedrock client restarts its own break progress, so a
     * fast tool's time cannot be kept for a block finished with a slow one. A report of the slot
     * already held changes nothing.
     */
    public handle({ slot }: Intent<'selectHotbarSlot'>, { session }: InputContext): undefined {
        const player = session.getPlayer();
        const inventory = player.getInventory();
        const previousSlot = inventory.getHandSlot();
        inventory.setHandSlot(slot);

        const mining = blockMiningOf(player.getComponents().get('mining.block'));
        if (mining !== null && slot !== previousSlot) {
            const world = session.getWorld();
            world.stopBlockCracking(mining.position);
            const restarted = world.startBlockCracking(
                mining.position,
                mining.face,
                inventory.equipment('mainhand'),
                null,
                session.handledInputs()
            );
            session.inputs().setPlayerMining(player, playerMiningOf(restarted));
        }
    }
}
