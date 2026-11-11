import type { HandlerServices, InputContext } from '../network/handler/HandlerContext';
import type PlayerSession from '../network/PlayerSession';
import type Server from '../Server';
import { stub } from './stub.test.helper';

/**
 * An input-lane handler's context over a test's `Server` double, with a step that keeps what the
 * handler hands it.
 *
 * For the tests that built a server for a handler before it took a context. Each part is read
 * from the server when the handler uses it, as the server's own contexts are, so a double that
 * leaves a part out fails only a handler that reads it. The services are the ones the movement,
 * action and inventory handlers read.
 *
 * @returns The context, and `settled`, which runs the deferred work and waits for the outputs as
 *   the input step does.
 */
export const serverInputContext = (server: Server, session: PlayerSession) => {
    const outputs: Promise<void>[] = [];
    const deferred: (() => Promise<void>)[] = [];
    const services = stub<HandlerServices>({
        events: { post: (pair) => server.post(pair), emit: (id, event) => server.emit(id, event) }
    });
    Object.defineProperties(services, {
        content: { get: () => server.getContent() },
        contentWorld: { get: () => server.getContentWorld() },
        creativeInventory: { get: () => server.getCreativeInventory() }
    });
    const context: InputContext = {
        session,
        get log() {
            return server.getLogger();
        },
        get config() {
            return server.getConfig();
        },
        services,
        step: {
            get tick() {
                return server.getTick();
            },
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
