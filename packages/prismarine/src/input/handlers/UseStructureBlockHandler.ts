import BlockPosition from '../../world/BlockPosition';
import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { blockTargetRejection } from './BlockTarget';
import { STRUCTURE_BLOCKS } from './structureBlocks';

/**
 * A structure block asked to act on its structure.
 *
 * A request whose position is not a structure block within reach in a loaded chunk is dropped at
 * verbose level. The rest are recorded at debug level and dropped too. Known gap: the server has
 * no structure template storage, so nothing is saved or loaded and no answer goes back.
 */
export default class UseStructureBlockHandler implements IntentHandler<'useStructureBlock'> {
    public static readonly Kind = 'useStructureBlock';

    /** Checks the position names a structure block in reach, then logs the name and operation. */
    public handle(
        { position, structure, operation }: Intent<'useStructureBlock'>,
        { session, log }: SessionContext
    ): void {
        const rejection = blockTargetRejection(
            session,
            new BlockPosition(position.x, position.y, position.z),
            STRUCTURE_BLOCKS
        );
        if (rejection !== null) {
            log.verbose(
                `Dropped a structure template request from ${session.identity.name} at ${position.x}, ${position.y}, ${position.z}: ${rejection}`
            );
            return;
        }

        log.debug(
            `${session.identity.name} requested structure ${structure} with operation ${operation}. The server stores no structure templates`
        );
    }
}
