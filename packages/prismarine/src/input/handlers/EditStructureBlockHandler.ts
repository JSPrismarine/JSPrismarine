import BlockPosition from '../../world/BlockPosition';
import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { blockTargetRejection } from './BlockTarget';
import { STRUCTURE_BLOCKS } from './structureBlocks';

/**
 * The settings a player left in a structure block's screen.
 *
 * An edit whose position is not a structure block within reach in a loaded chunk is dropped at
 * verbose level. The rest are recorded at debug level and dropped too. Known gap: the structure
 * block has no block entity here, so its settings are not stored.
 */
export default class EditStructureBlockHandler implements IntentHandler<'editStructureBlock'> {
    public static readonly Kind = 'editStructureBlock';

    /** Checks the position names a structure block in reach, then logs the structure name. */
    public handle({ position, structure }: Intent<'editStructureBlock'>, { session, log }: SessionContext): void {
        const where = `${position.x}, ${position.y}, ${position.z}`;
        const rejection = blockTargetRejection(
            session,
            new BlockPosition(position.x, position.y, position.z),
            STRUCTURE_BLOCKS
        );
        if (rejection !== null) {
            log.verbose(`Dropped a structure block update from ${session.identity.name} at ${where}: ${rejection}`);
            return;
        }

        log.debug(
            `${session.identity.name} set the structure block at ${where} to structure "${structure}". Structure blocks are not stored`
        );
    }
}
