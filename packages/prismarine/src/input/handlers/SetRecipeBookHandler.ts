import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player changed a recipe book's settings.
 *
 * Recorded at debug level and dropped. The settings are a preference, and each client reapplies
 * its own on the next join, so nothing breaks by not keeping them. Known gap: the server does not
 * remember them across a rejoin, which needs a field on the player's saved data, and a Java
 * client is never sent them back in `Recipe Book Settings`.
 */
export default class SetRecipeBookHandler implements IntentHandler<'setRecipeBook'> {
    public static readonly Kind = 'setRecipeBook';

    /** Logs the book's settings. */
    public handle({ book, open, filtering }: Intent<'setRecipeBook'>, { session, log }: SessionContext): void {
        const opened = open === null ? '' : `${open ? 'open' : 'closed'}, `;
        log.debug(
            `${session.identity.name} set the ${book} recipe book: ${opened}filtering ${filtering ? 'on' : 'off'}. Recipe book settings are not stored`
        );
    }
}
