import type { InputContext } from '../../network/handler/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player pressed the inventory button.
 *
 * Opening the inventory files the window before this returns and hands the sends to the step's
 * outputs, so the window is on the session's table once the handler returns and its packets go
 * out after it.
 */
export default class OpenInventoryHandler implements IntentHandler<'openInventory'> {
    public static readonly Kind = 'openInventory';

    /** Opens the sender's main inventory. */
    public handle(_intent: Intent<'openInventory'>, { session, step }: InputContext): undefined {
        step.output(session.openMainInventory());
    }
}
