import BlockPosition from '../../world/BlockPosition';
import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { blockTargetRejection } from './BlockTarget';

/** The one block whose screen runs chemistry. */
const LAB_TABLES: ReadonlySet<string> = new Set(['minecraft:lab_table']);

/**
 * An Education Edition player worked the chemistry lab table.
 *
 * An action whose position is not a lab table within reach in a loaded chunk is dropped at
 * verbose level. The rest are recorded at debug level and dropped too. Known gap: there is no
 * chemistry recipe table, so a combine produces nothing and no reaction is sent back.
 */
export default class UseLabTableHandler implements IntentHandler<'useLabTable'> {
    public static readonly Kind = 'useLabTable';

    /** Checks the position names a lab table in reach, then logs the action and position. */
    public handle({ position, action }: Intent<'useLabTable'>, { session, log }: SessionContext): void {
        const where = `${position.x}, ${position.y}, ${position.z}`;
        const rejection = blockTargetRejection(
            session,
            new BlockPosition(position.x, position.y, position.z),
            LAB_TABLES
        );
        if (rejection !== null) {
            log.verbose(`Dropped a lab table action from ${session.identity.name} at ${where}: ${rejection}`);
            return;
        }

        log.debug(`${session.identity.name} ran ${action} on the lab table at ${where}. Chemistry is not simulated`);
    }
}
