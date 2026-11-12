/**
 * Where the server builds the contexts handlers in the shared shape take, and runs such a
 * handler in its lane
 * ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * This is the one module that turns the `Server` into a handler context. It sits outside
 * `network/handler/`, which is meant to import no `Server` at all once every handler has moved.
 */
import type Server from '../Server';
import { applyInputNow } from '../world/inputUnit';
import type { HandlerServices, InputStep, SessionContext } from './handler/HandlerContext';
import type { InputLaneHandler, SessionHandler } from './handler/SessionHandler';
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
    | 'getWorldMessages'
    | 'getConsoleSender'
    | 'getKernel'
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
    get messages() {
        return server.getWorldMessages();
    },
    get console() {
        return server.getConsoleSender();
    },
    get events() {
        return server.getKernel().events;
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
     * Runs a connection-lane or read-lane handler for a packet that arrived on a session, and
     * waits for it.
     *
     * @param handler - The handler.
     * @param packet - The decoded packet.
     * @param session - The session the packet arrived on.
     * @returns Settles once the handler is done.
     */
    public async run<P>(
        handler: Exclude<SessionHandler<P>, InputLaneHandler<P>>,
        packet: P,
        session: PlayerSession
    ): Promise<void> {
        await handler.handle(packet, contextOf(this.server, session, {}));
    }

    /**
     * Applies an input-lane handler as one synchronous unit of the world the session's player is
     * in, so a throw undoes what it wrote. Nothing waits: what the handler handed to
     * {@link InputStep.output} finishes outside the tick, and a failure there is reported to
     * `report` ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
     *
     * @param handler - The handler.
     * @param packet - The decoded packet.
     * @param session - The session the packet arrived on.
     * @param report - Where a failed output goes.
     * @throws The handler's error, after its writes are undone.
     */
    public runInput<P>(
        handler: InputLaneHandler<P>,
        packet: P,
        session: PlayerSession,
        report: (error: unknown) => void
    ): void {
        const step: InputStep = {
            tick: this.server.getTick(),
            output: (send) => void send.catch(report)
        };
        const context = contextOf(this.server, session, { services: this.services, step });
        applyInputNow(session, () => handler.handle(packet, context));
    }
}
