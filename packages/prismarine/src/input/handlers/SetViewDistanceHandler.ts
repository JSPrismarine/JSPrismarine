import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * Answers a view distance request with the smallest radius every side can take.
 *
 * The grant is the least of the requested radius, the client's maximum when it stated one (zero
 * means it did not), and the server's configured view distance, and never below 1 so a request
 * for 0 does not switch terrain off.
 *
 * The answer is what opens the window a client accepts terrain in: the first request is also
 * what starts the spawn chunks, see `PlayerSession.setViewDistance`.
 */
export default class SetViewDistanceHandler implements IntentHandler<'setViewDistance'> {
    public static readonly Kind = 'setViewDistance';

    /** Grants a radius and records the exchange at debug level, since the join hinges on it. */
    public handle(
        { radius, maxRadius }: Intent<'setViewDistance'>,
        { session, log, config, step }: InputContext
    ): undefined {
        const limits = [radius, config.getViewDistance()];
        if (maxRadius > 0) limits.push(maxRadius);

        const granted = Math.max(1, Math.min(...limits));
        log.debug(
            `${session.identity.name} asked for a chunk radius of ${radius} (max ${maxRadius}), granted ${granted}`
        );

        // The radius is set before the first wait. What follows it is the answer and the chunk
        // streaming the answer opens, which belongs to the session and runs outside the tick.
        step.output(session.setViewDistance(granted));
    }
}
