import type {
    HandlerConfig,
    HandlerLog,
    HandlerServices,
    InputContext,
    SessionContext
} from '../network/handler/HandlerContext';
import { IntentHandlerRegistry } from '../input/IntentHandlerRegistry';
import type PlayerSession from '../player/PlayerSession';
import { stub } from './stub.test.helper';
import type { StubMembers } from './stub.test.helper';

/** The built-in intent handlers, as a started server has them. */
const builtInIntents = (): IntentHandlerRegistry => {
    const registry = new IntentHandlerRegistry({ debug: () => {}, verbose: () => {} });
    registry.enable();
    return registry;
};

/** What a test hands {@link sessionContext} or {@link inputContext} beside the session. */
export interface ContextParts {
    readonly log?: HandlerLog;
    readonly config?: StubMembers<HandlerConfig>;
    readonly services?: StubMembers<HandlerServices>;
    readonly tick?: number;
}

/** The context of a connection-lane or read-lane handler, over a test's session. */
export const sessionContext = (session: PlayerSession, parts: ContextParts = {}): SessionContext => ({
    session,
    log: parts.log ?? stub<HandlerLog>(),
    config: stub<HandlerConfig>(parts.config)
});

/**
 * The context of an input-lane handler, over a test's session, with a step that keeps what the
 * handler hands it.
 *
 * @returns The context, the outputs in the order the handler handed them over, and `settled`,
 *   which waits for the outputs, as the transport finishes them after the step.
 */
export const inputContext = (session: PlayerSession, parts: ContextParts = {}) => {
    const outputs: Promise<void>[] = [];
    const context: InputContext = {
        ...sessionContext(session, parts),
        // A bus no one listens on and the built-in intent handlers, unless the test hands its own.
        services: stub<HandlerServices>({
            events: { post: () => 0 },
            intents: builtInIntents(),
            // No update is known, so a player who joins hears about none.
            updates: { welcome: async () => undefined },
            ...parts.services
        }),
        step: {
            tick: parts.tick ?? 0,
            output: (send) => void outputs.push(send)
        }
    };
    const settled = async () => {
        await Promise.all(outputs);
    };
    return { context, outputs, settled };
};
