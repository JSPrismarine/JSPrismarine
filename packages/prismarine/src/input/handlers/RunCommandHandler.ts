import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * A command line the player issued.
 *
 * The command manager checks the sender's permission, so a player who may not run `/gamerule`
 * cannot change a world setting from a menu either, and sends the command's messages to the
 * player itself.
 */
export default class RunCommandHandler implements IntentHandler<'runCommand'> {
    public static readonly Kind = 'runCommand';

    /** Dispatches the command line as the player who sent it. */
    public handle({ command }: Intent<'runCommand'>, { session, services, step }: InputContext): undefined {
        // The command runs in this input's unit; what it started is the step's to finish.
        step.output(services.commands.runCommand(session, session, command).settled);
    }
}
