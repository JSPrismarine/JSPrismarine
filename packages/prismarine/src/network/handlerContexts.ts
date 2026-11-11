/**
 * Where the server builds the contexts handlers in the shared shape take, and runs such a
 * handler in its lane
 * ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * This is the one module that turns the `Server` into a handler context. It sits outside
 * `network/handler/`, which is meant to import no `Server` at all once every handler has moved.
 */
import type Server from '../Server';
import { applyInput, applyInputNow } from '../world/inputUnit';
import type { HandlerServices, InputStep, SessionContext } from './handler/HandlerContext';
import type { SessionHandler } from './handler/SessionHandler';
import type PlayerSession from './PlayerSession';

/** The parts of the server a context is built from. */
export type ContextSource = Pick<
    Server,
    | 'getLogger'
    | 'getConfig'
    | 'getTick'
    | 'getContent'
    | 'getContentWorld'
    | 'getCreativeInventory'
    | 'getSessionManager'
    | 'getPermissionManager'
    | 'getCommandManager'
    | 'getChatManager'
    | 'getWorldReplicators'
    | 'getConsoleSender'
    | 'post'
    | 'emit'
>;

/**
 * A session's context with `extra` beside it. The server's parts are read when the handler uses
 * them, not when the context is built, so a part that is not ready yet, such as the content
 * before the pack stack is built, fails only the handler that reads it.
 */
const contextOf = <E extends object>(server: ContextSource, session: PlayerSession, extra: E): SessionContext & E => ({
    ...extra,
    session,
    get log() {
        return server.getLogger();
    },
    get config() {
        return server.getConfig();
    }
});

const servicesOf = (server: ContextSource): HandlerServices => ({
    get content() {
        return server.getContent();
    },
    get contentWorld() {
        return server.getContentWorld();
    },
    get creativeInventory() {
        return server.getCreativeInventory();
    },
    get sessions() {
        return server.getSessionManager();
    },
    get permissions() {
        return server.getPermissionManager();
    },
    get commands() {
        return server.getCommandManager();
    },
    get chat() {
        return server.getChatManager();
    },
    get replicators() {
        return server.getWorldReplicators();
    },
    get console() {
        return server.getConsoleSender();
    },
    // Bound rather than handed over, so a handler holds the two methods and not the server.
    events: {
        post: (pair) => server.post(pair),
        emit: (id, event) => server.emit(id, event)
    },
    defaults: {
        setGamemode: (gamemode, commit) => server.getConfig().setGamemode(gamemode, commit)
    }
});

/** One server's handler contexts. */
export class HandlerContexts {
    private static readonly built = new WeakMap<ContextSource, HandlerContexts>();

    private readonly server: ContextSource;
    private readonly services: HandlerServices;

    private constructor(server: ContextSource) {
        this.server = server;
        this.services = servicesOf(server);
    }

    /**
     * The contexts of one server, built the first time they are asked for.
     *
     * @param server - The server the contexts read.
     */
    public static of(server: ContextSource): HandlerContexts {
        let contexts = HandlerContexts.built.get(server);
        if (contexts === undefined) {
            contexts = new HandlerContexts(server);
            HandlerContexts.built.set(server, contexts);
        }
        return contexts;
    }

    /**
     * Runs one handler for a packet that arrived on a session, in the way its lane asks.
     *
     * A connection-lane or read-lane handler is awaited. An input-lane handler is applied as one
     * synchronous unit of the world the session's player is in, so a throw undoes what it wrote.
     * The work it handed to {@link InputStep.defer} then runs in order, each piece a unit of its
     * own, and the sends it handed to {@link InputStep.output} are awaited last, before this
     * settles, so the next input still starts after all of it, as it did when handlers awaited.
     *
     * @param handler - The handler.
     * @param packet - The decoded packet.
     * @param session - The session the packet arrived on.
     * @returns Settles once the handler and its outputs are done.
     * @throws The handler's error, a deferred piece's, or the first output's, once every output
     *   has settled.
     */
    public async run<P>(handler: SessionHandler<P>, packet: P, session: PlayerSession): Promise<void> {
        if (handler.lane !== 'input') {
            await handler.handle(packet, contextOf(this.server, session, {}));
            return;
        }

        const outputs: Promise<void>[] = [];
        const deferred: (() => Promise<void>)[] = [];
        const step: InputStep = {
            tick: this.server.getTick(),
            output: (send) => void outputs.push(send),
            defer: (work) => void deferred.push(work)
        };
        const context = contextOf(this.server, session, { services: this.services, step });
        try {
            applyInputNow(session, () => handler.handle(packet, context));
            // A piece deferred by an earlier piece joins the end of the list and runs too.
            for (const work of deferred) await applyInput(session, work);
        } catch (error: unknown) {
            await Promise.allSettled(outputs);
            throw error;
        }
        await Promise.all(outputs);
    }
}
