import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player middle-clicked a block to take its item.
 *
 * The pick is recorded at debug level and dropped. Known gap: answering needs the block's item
 * form placed into the hotbar, which the inventory code does not expose for a server-initiated
 * pick yet.
 */
export default class PickBlockHandler implements IntentHandler<'pickBlock'> {
    public static readonly Kind = 'pickBlock';

    /** Logs the picked position. */
    public handle({ position, withData }: Intent<'pickBlock'>, { session, log }: SessionContext): void {
        log.debug(
            `${session.identity.name} picked the block at ${position.x}, ${position.y}, ${position.z}${withData ? ' with data' : ''}. Block picking is not implemented`
        );
    }
}
