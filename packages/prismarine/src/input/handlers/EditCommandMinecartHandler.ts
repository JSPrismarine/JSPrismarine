import { mayEditCommandBlocks } from '../../command/commandBlockAccess';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player set the command a command block minecart runs over a powered activator rail.
 *
 * Only an operator in creative mode may edit one; an edit from anybody else, or of an actor that
 * is no command block minecart, is dropped at verbose level.
 */
export default class EditCommandMinecartHandler implements IntentHandler<'editCommandMinecart'> {
    public static readonly Kind = 'editCommandMinecart';

    /** Stores the cart's command, or drops an edit the sender may not make. */
    public handle(
        { target, command, trackOutput, customName }: Intent<'editCommandMinecart'>,
        { session, log }: InputContext
    ): undefined {
        const name = session.identity.name;
        if (!mayEditCommandBlocks(session)) {
            log.verbose(`Dropped a command block edit from ${name}: only an operator in creative mode may make one`);
            return;
        }

        const taken = session
            .getWorld()
            .dataEntities()
            .runtime.setMinecartCommand(Number(target), {
                command,
                trackOutput,
                ...(customName === undefined ? {} : { customName })
            });
        if (!taken) log.verbose(`Dropped a command block edit from ${name}: ${target} is no command block minecart`);
    }
}
