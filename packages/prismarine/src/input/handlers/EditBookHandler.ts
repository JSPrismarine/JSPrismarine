import type { SessionContext } from '../../player/context/HandlerContext';
import type { BookEditStep, Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The only item a book edit can apply to. Signing turns it into a written book. */
const WRITABLE_BOOK = 'minecraft:writable_book';

/** What an edit did, for the log line. */
const describe = (edit: BookEditStep): string => {
    switch (edit.kind) {
        case 'sign':
            return `signed the book "${edit.title}" as ${edit.author}`;
        case 'swapPages':
            return `swapped pages ${edit.page} and ${edit.other}`;
        case 'deletePage':
            return `deleted page ${edit.page}`;
        case 'addPage':
        case 'replacePage':
            return `${edit.kind === 'addPage' ? 'added' : 'replaced'} page ${edit.page} (${edit.text.length} chars)`;
        case 'setPages':
            return edit.title === null
                ? `wrote ${edit.pages.length} pages`
                : `signed the book "${edit.title}" with ${edit.pages.length} pages`;
    }
};

/**
 * The player edited a book and quill.
 *
 * An edit aimed at a slot that holds no book and quill is dropped at verbose level. Each edition
 * checks the page numbers against its own client's limit before it gets here. The rest are
 * recorded at debug level and dropped too. Known gap: items carry no pages here, so there is no
 * book to write into; the client keeps its local copy until it relogs.
 */
export default class EditBookHandler implements IntentHandler<'editBook'> {
    public static readonly Kind = 'editBook';

    /** Checks the slot holds a book and quill, then logs the edit. */
    public handle({ slot, edit }: Intent<'editBook'>, { session, log }: SessionContext): void {
        // `get` answers null for a slot the inventory does not have, so an out of range slot
        // fails the same way as an empty one.
        const held = session.getPlayer().getInventory().container('inventory').get(slot)?.getName() ?? 'minecraft:air';
        if (held !== WRITABLE_BOOK) {
            log.verbose(`Dropped a book edit from ${session.identity.name}: slot ${slot} holds ${held}`);
            return;
        }

        log.debug(
            `${session.identity.name} ${describe(edit)} in slot ${slot}. Books are not stored, so nothing changed`
        );
    }
}
