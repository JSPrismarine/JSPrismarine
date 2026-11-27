import BlockPosition from '../../world/BlockPosition';
import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { blockTargetRejection } from './BlockTarget';

/** The one block whose book turns a page. */
const LECTERNS: ReadonlySet<string> = new Set(['minecraft:lectern']);

/**
 * The player turned the page of the book on a lectern.
 *
 * A turn whose position is not a lectern within reach in a loaded chunk is dropped at verbose
 * level. The rest are recorded at debug level and dropped too. Known gap: the lectern block
 * entity does not store a page, so there is nothing to update or to show other viewers.
 */
export default class TurnLecternPageHandler implements IntentHandler<'turnLecternPage'> {
    public static readonly Kind = 'turnLecternPage';

    /** Checks the position names a lectern in reach, then logs the page and position. */
    public handle({ position, page, totalPages }: Intent<'turnLecternPage'>, { session, log }: SessionContext): void {
        const where = `${position.x}, ${position.y}, ${position.z}`;

        const rejection = blockTargetRejection(
            session,
            new BlockPosition(position.x, position.y, position.z),
            LECTERNS
        );
        if (rejection !== null) {
            log.verbose(`Dropped a lectern page turn from ${session.identity.name} at ${where}: ${rejection}`);
            return;
        }

        log.debug(
            `${session.identity.name} turned the lectern at ${where} to page ${page} of ${totalPages}. Lectern pages are not stored`
        );
    }
}
