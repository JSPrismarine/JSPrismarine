import BlockPosition from '../../world/BlockPosition';
import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { blockTargetRejection } from './BlockTarget';

/** The one block whose screen toggles a slot. */
const CRAFTERS: ReadonlySet<string> = new Set(['minecraft:crafter']);

/** A crafter has a three by three grid, so a slot index runs from 0 to 8. */
const CRAFTER_SLOTS = 9;

/**
 * The player turned a crafter's slot off or on.
 *
 * A toggle whose position is not a crafter within reach in a loaded chunk, or whose slot is not
 * one of the nine, is dropped at verbose level. The rest are recorded at debug level and dropped
 * too. Known gap: the crafter block has no block entity here, so there is no slot state to flip
 * or to send back.
 */
export default class ToggleCrafterSlotHandler implements IntentHandler<'toggleCrafterSlot'> {
    public static readonly Kind = 'toggleCrafterSlot';

    /** Checks the slot exists and the position names a crafter in reach, then logs the toggle. */
    public handle({ position, slot, disabled }: Intent<'toggleCrafterSlot'>, { session, log }: SessionContext): void {
        const where = `${position.x}, ${position.y}, ${position.z}`;
        const rejection =
            !Number.isInteger(slot) || slot < 0 || slot >= CRAFTER_SLOTS
                ? `a crafter has no slot ${slot}`
                : blockTargetRejection(session, new BlockPosition(position.x, position.y, position.z), CRAFTERS);
        if (rejection !== null) {
            log.verbose(`Dropped a crafter slot toggle from ${session.identity.name} at ${where}: ${rejection}`);
            return;
        }

        log.debug(
            `${session.identity.name} ${disabled ? 'disabled' : 'enabled'} slot ${slot} of the crafter at ${where}. Crafters are not stored`
        );
    }
}
