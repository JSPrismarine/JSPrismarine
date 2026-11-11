/**
 * The client's packet handlers, in the shape `@jsprismarine/protocol` defines for both sides
 * ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * A handler takes the payload its packet class decodes and a {@link ClientContext}, and runs only
 * in the phases it lists. The client has no world tick, so a handler may return a promise. The
 * session counts that promise until it settles, so a harness that waits for an idle client waits
 * for the handler's replies too.
 */
import type { Logger } from '@jsprismarine/logger';
import type { PacketHandler } from '@jsprismarine/protocol/handler/PacketHandler';
import type ClientSession from './ClientSession';

/**
 * Where a client's session stands. It is `login` from the first packet until the login sequence
 * has answered the spawn, and `play` after that.
 */
export type ClientPhase = 'login' | 'play';

/** The logger levels a handler writes at. */
export type ClientLog = Pick<Logger, 'silly' | 'debug' | 'verbose' | 'info' | 'warn' | 'error'>;

/** What the client hands a packet handler beside the decoded payload. */
export interface ClientContext {
    /** The session the packet arrived on, narrowed to what a handler does with it. */
    readonly session: Pick<ClientSession, 'send' | 'sendImmediate' | 'enableCompression' | 'enableEncryption'>;
    /** Where the handler logs. */
    readonly log: ClientLog;
}

/**
 * A handler for one clientbound packet.
 *
 * @typeParam T - The payload the packet class decodes.
 */
export type ClientPacketHandler<T> = PacketHandler<T, ClientContext, ClientPhase>;
