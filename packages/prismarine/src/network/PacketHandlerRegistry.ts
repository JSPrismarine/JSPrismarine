import * as Handlers from './Handlers';
import * as Decoders from './decoder/Decoders';

import type Server from '../Server';
import type { IntentKind } from '../input/Intent';
import { IntentHandlerRegistry } from '../input/IntentHandlerRegistry';
import Timer from '../utils/Timer';
import { decodedHandler } from './decoder/decodedHandler';
import type { PacketDecoder, PacketDecoderClass } from './decoder/PacketDecoder';
import type { ConnectionHandler } from './handler/ConnectionContext';
import { strictestLane } from '@jsprismarine/protocol/handler/Lane';
import type { InputContext, SessionContext } from './handler/HandlerContext';
import type { SessionHandler } from './handler/SessionHandler';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

/** Handler kind stored by the server; phases determine which one receives a packet. */
export type RegisteredHandler = ConnectionHandler<any> | SessionHandler<any>;

/**
 * Server-owned dispatch handlers, keyed by protocol packet name.
 *
 * A packet has either a handler or a decoder
 * ([ADR 0027](../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)). A decoder is
 * registered as a handler too, wrapped so that it runs in the lane its intents need and hands
 * each intent to {@link PacketHandlerRegistry.getIntentHandlers}.
 */
export default class PacketHandlerRegistry {
    private readonly server: Pick<Server, 'getLogger'>;
    private readonly handlers: Map<string, RegisteredHandler> = new Map();
    private readonly intents: IntentHandlerRegistry;

    /**
     * @param server - Where the registry logs.
     * @param intents - The intent handlers decoders dispatch to; built over the server's logger
     *   when left out.
     */
    public constructor(server: Pick<Server, 'getLogger'>, intents?: IntentHandlerRegistry) {
        this.server = server;
        this.intents = intents ?? new IntentHandlerRegistry(server.getLogger());
    }

    /** Register the intent handlers, the packet handlers and the decoders when the server starts. */
    public async enable(): Promise<void> {
        this.intents.enable();
        await this.registerHandlers();
    }

    /** Clear every handler and decoder when the server stops. */
    public async disable(): Promise<void> {
        this.handlers.clear();
        this.intents.disable();
    }

    /** The intent handlers the decoders dispatch to, where a plugin registers behavior once. */
    public getIntentHandlers(): IntentHandlerRegistry {
        return this.intents;
    }

    /**
     * Register a decoder for the packet it reads, wrapped into a handler in its intents' lane.
     *
     * @throws When the packet already has a handler or a decoder.
     */
    public registerDecoder<P, K extends IntentKind>(packetName: string, decoder: PacketDecoder<P, K>): void {
        this.registerHandler(packetName, decodedHandler(packetName, decoder, this.intents));
    }

    /** Register a handler for the packet name it handles. */
    public registerHandler(packetName: string, handler: RegisteredHandler): void {
        if (this.handlers.has(packetName)) throw new PrismarineNetworkErrors.DuplicateHandler({ packetName });

        this.handlers.set(packetName, handler);
        this.server.getLogger().debug(`Handler with id §b${handler.constructor.name}§r registered`);
    }

    /** Find the handler registered for a packet class name. */
    public getHandler(packetName: string): RegisteredHandler {
        if (!this.handlers.has(packetName)) throw new PrismarineNetworkErrors.NoHandler({ packetName });

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
        const decoders: readonly PacketDecoderClass[] = Object.values(Decoders);
        decoders.forEach((Decoder) => this.registerDecoder(Decoder.PacketName, new Decoder()));
        this.server
            .getLogger()
            .verbose(`Registered §b${this.handlers.size}§r packet handler(s) (took §e${timer.stop()} ms§r)!`);
    }
}
