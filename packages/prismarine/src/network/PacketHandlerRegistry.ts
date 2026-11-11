import * as Handlers from './Handlers';

import type Server from '../Server';
import Timer from '../utils/Timer';
import type { ConnectionHandler } from './handler/ConnectionContext';
import { strictestLane } from '@jsprismarine/protocol/handler/Lane';
import type { InputContext, SessionContext } from './handler/HandlerContext';
import type { SessionHandler } from './handler/SessionHandler';

/** Handler kind stored by the server; phases determine which one receives a packet. */
export type RegisteredHandler = ConnectionHandler<any> | SessionHandler<any>;

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
     * The merged handler runs in the first handler's phases and in the stricter of the two lanes,
     * so it takes that lane's context, which every part can be handed. An input-lane merge returns
     * nothing to wait for: a part that returns a promise has it handed to the step's outputs.
     * @param handler - The first handler, which runs first and determines the phases.
     * @param handler2 - The handler that runs after the first one.
     * @returns A handler that invokes both handlers in order.
     */
    public appendHandler(handler: SessionHandler<any>, handler2: SessionHandler<any>): SessionHandler<any> {
        const parts = [handler, handler2];
        const phases = handler.phases;
        const lane = strictestLane(handler.lane, handler2.lane);

        if (lane === 'input') {
            return {
                lane,
                phases,
                handle: (packet: any, context: InputContext) => {
                    for (const part of parts) {
                        const result = part.handle(packet, context);
                        if (result instanceof Promise) context.step.output(result);
                    }
                    return undefined;
                }
            };
        }

        // Neither part is in the input lane, or the merge would be, so each takes a session context.
        const handle = async (packet: any, context: SessionContext) => {
            for (const part of parts) if (part.lane !== 'input') await part.handle(packet, context);
        };
        return lane === 'read' ? { lane, phases, handle } : { lane, phases, handle };
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
