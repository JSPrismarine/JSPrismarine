/**
 * One Java Edition connection: the release it speaks, where it is in the conversation, what its
 * login has agreed so far, and how a packet leaves by it.
 */
import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { encodeJavaPacket } from '@jsprismarine/protocol/java/packet/JavaPacket';
import type { JavaProtocol } from '@jsprismarine/protocol/java/versions/javaRelease';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import { compressFrame } from '@jsprismarine/protocol/java/wire/compression';
import type { Logger } from '@jsprismarine/logger';

import type { TranslationKey } from '../../chat/ConsoleText';
import { errorMessage } from '../../utils/errorMessage';
import type { KeepAlive } from '../KeepAlive';
import type PlayerSession from '../PlayerSession';
import type { TcpTransportConnection } from '../transport/TcpTransport';
import type { JavaProfile } from './javaAuth';

/** Where a connection is in the conversation. */
export type JavaConnectionPhase = JavaPacketDefinition['phase'];

/**
 * A translated reason, as the login phase's JSON text component.
 * @param key - A key the server has English for, which the client translates itself.
 * @param args - What fills the key's placeholders.
 * @returns The JSON.
 */
export const translated = (key: TranslationKey, ...args: string[]): string =>
    JSON.stringify(args.length === 0 ? { translate: key } : { translate: key, with: args });

/** One Java Edition connection and its state. */
export class JavaConnection {
    /**
     * The release the connection speaks. Until the handshake names one, the newest: the handshake
     * and the status phase have the same ids and layouts in every release.
     */
    public protocol: JavaProtocol = NEWEST_JAVA_RELEASE;
    public phase: JavaConnectionPhase = 'handshake';
    /** The threshold once `Set Compression` has gone, after which every frame is compressed. */
    public compression?: number;
    /** The name and token of a login waiting for its encryption response. */
    public pending?: { readonly name: string; readonly verifyToken: Buffer };
    public profile?: JavaProfile;
    /** Whether the server sent `Finish Configuration`, which the client's acknowledgement answers. */
    public configured?: boolean;
    /** Whether Mojang vouched for the profile, which makes the player a `java` subject rather than `offline`. */
    public verified?: boolean;
    /** The player's session, once they are in the world. */
    public session?: PlayerSession;
    /**
     * Where the last move put the player's feet, and its facing and footing, for the moves that
     * leave some of it out. Kept here rather than read off the player, whose earlier moves may
     * still wait in the input queue.
     */
    public pose?: { x: number; y: number; z: number; yaw: number; pitch: number; onGround: boolean };
    /** Whether the client confirmed a teleport since its last move, as Bedrock's `HandledTeleport` says. */
    public teleportHandled?: boolean;
    /** Whether the transport closed, after which nothing is started for the connection. */
    public closed = false;
    /** The pings that check the client is still there, once the player is in play. */
    public keepAlive?: KeepAlive;

    /**
     * @param transport - The TCP connection the packets travel over.
     * @param log - Where a failure is logged.
     */
    public constructor(
        public readonly transport: TcpTransportConnection,
        private readonly log: Pick<Logger, 'debug'>
    ) {}

    /** Sends one packet, compressed once `Set Compression` has gone. */
    public send<D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): void {
        const packet = encodeJavaPacket(this.protocol, definition, value);
        this.transport.sendFrame(this.compression === undefined ? packet : compressFrame(packet, this.compression));
    }

    /** Hangs up. */
    public close(): Promise<void> {
        return this.transport.close();
    }

    /**
     * Lets an input the world applies later go on without the connection waiting for it, and
     * closes the connection if it fails, as a packet it could not read closes it.
     */
    public queue(applied: Promise<void>): void {
        void applied.catch((error: unknown) => this.failed(error));
    }

    /** Closes a connection whose queued work failed. */
    public async failed(error: unknown): Promise<void> {
        this.log.debug(`Java connection ${this.transport.id} failed in play: ${errorMessage(error)}`);
        await this.close();
    }
}
