import type {
    HandlerConfig,
    HandlerLog,
    HandlerServices,
    InputContext,
    SessionContext
} from '../network/handler/HandlerContext';
import type PlayerSession from '../network/PlayerSession';
import { stub } from './stub.test.helper';
import type { StubMembers } from './stub.test.helper';

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
 * @returns The context, the outputs and deferred work in the order the handler handed them over,
 *   and `settled`, which runs the deferred work and waits for the outputs as the input step does.
 */
export const inputContext = (session: PlayerSession, parts: ContextParts = {}) => {
    const outputs: Promise<void>[] = [];
    const deferred: (() => Promise<void>)[] = [];
    const context: InputContext = {
        ...sessionContext(session, parts),
        services: stub<HandlerServices>(parts.services),
        step: {
            tick: parts.tick ?? 0,
            output: (send) => void outputs.push(send),
            defer: (work) => void deferred.push(work)
        }
    };
    const settled = async () => {
        for (const work of deferred) await work();
        await Promise.all(outputs);
    };
    return { context, outputs, deferred, settled };
};
