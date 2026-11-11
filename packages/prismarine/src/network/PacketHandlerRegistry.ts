import * as Handlers from './Handlers';

import type { PlayerSession } from '../';
import type Server from '../Server';
import Timer from '../utils/Timer';
import type PacketHandler from './handler/PacketHandler';
import type { ConnectionHandler } from './handler/ConnectionContext';
import { strictestLane } from '@jsprismarine/protocol/handler/Lane';
import { HandlerContexts } from './handlerContexts';
import type { SessionHandler } from './handler/SessionHandler';
import { takesContext } from './handler/SessionHandler';

/**
 * Handler kind stored by the server; phases determine which one receives a packet. A session
 * handler takes either a context ({@link SessionHandler}) or, until every handler has moved to the
 * shared shape, the whole server ({@link PacketHandler}).
 */
export type RegisteredHandler = PacketHandler<any> | ConnectionHandler<any> | SessionHandler<any>;

/** A handler of a player session, in either shape. */
export type RegisteredSessionHandler = PacketHandler<any> | SessionHandler<any>;

/** Server-owned dispatch handlers, keyed by protocol packet name. */
export default class PacketHandlerRegistry {
    private readonly server: Pick<Server, 'getLogger'>;
    private readonly handlers: Map<string, RegisteredHandler> = new Map();

    public constructor(server: Pick<Server, 'getLogger'>) {
        this.server = server;
    }

    /** Register all packet handlers when the server starts. */
    public async enable(): Promise<void> {
        await this.registerHandlers();
    }

    /** Clear all packet handlers when the server stops. */
    public async disable(): Promise<void> {
        this.handlers.clear();
    }

    /** Register a handler for the packet name it handles. */
    public registerHandler(packetName: string, handler: RegisteredHandler): void {
        if (this.handlers.has(packetName)) throw new Error(`Handler for ${packetName} already exists!`);

        this.handlers.set(packetName, handler);
        this.server
            .getLogger()
            .debug(
                `Handler with id §b${handler.constructor.name}§r registered`,
                'PacketHandlerRegistry/registerHandler'
            );
    }

    /** Find the handler registered for a packet class name. */
    public getHandler(packetName: string): RegisteredHandler {
        if (!this.handlers.has(packetName)) throw new Error(`Invalid handler for packet ${packetName}!`);

        return this.handlers.get(packetName)!;
    }

    /**
     * Merge two handlers so a plugin can extend server behavior without replacing it.
     *
     * Either handler can take a context or the whole server. The merged handler takes the server,
     * which is enough to build the context of one that takes a context, and waits for each part:
     * it runs as one asynchronous input, as handlers that take the server do.
     * @param handler - The first handler, which runs first and determines the phases. The merged
     * handler takes the stricter of the two handlers' lanes.
     * @param handler2 - The handler that runs after the first one.
     * @returns A handler that invokes both handlers in order.
     */
    public appendHandler(handler: RegisteredSessionHandler, handler2: RegisteredSessionHandler): PacketHandler<any> {
        const run = async (part: RegisteredSessionHandler, packet: any, server: Server, session: PlayerSession) => {
            if (takesContext(part)) await HandlerContexts.of(server).run(part, packet, session);
            else await part.handle(packet, server, session);
        };
        return new (class Handler {
            /** The merged handler runs in the first handler's phases. */
            public readonly phases = handler.phases;

            /** The merged handler obeys both handlers' lanes. */
            public readonly lane = strictestLane(handler.lane, handler2.lane);

            public async handle(packet: any, server: Server, session: PlayerSession) {
                await run(handler, packet, server, session);
                await run(handler2, packet, server, session);
            }
        })();
    }

    /** Remove a handler registration. */
    public removeHandler(packetName: string): void {
        this.handlers.delete(packetName);
    }

    /** Return all currently registered handlers. */
    public getHandlers(): Map<string, RegisteredHandler> {
        return this.handlers;
    }

    private async registerHandlers(): Promise<void> {
        const timer = new Timer();
        Object.values(Handlers).forEach((Handler) => this.registerHandler(Handler.PacketName, new Handler()));
        this.server
            .getLogger()
            .verbose(`Registered §b${this.handlers.size}§r packet handler(s) (took §e${timer.stop()} ms§r)!`);
    }
}
