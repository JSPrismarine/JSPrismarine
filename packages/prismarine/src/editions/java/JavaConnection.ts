/**
 * One Java Edition connection: the release it speaks, where it is in the conversation, what its
 * login has agreed so far, and how a packet leaves by it.
 */
import type { ConfigurationClientInformation } from '@jsprismarine/protocol/java/packet/configuration';
import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { encodeJavaPacket } from '@jsprismarine/protocol/java/packet/JavaPacket';
import type { JavaProtocol } from '@jsprismarine/protocol/java/versions/javaRelease';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import { compressFrame } from '@jsprismarine/protocol/java/wire/compression';
import type { Logger } from '@jsprismarine/logger';

import type { TranslationKey } from '../../chat/ConsoleText';
import { errorMessage } from '../../utils/errorMessage';
import type { KeepAlive } from '../../player/KeepAlive';
import type PlayerSession from '../../player/PlayerSession';
import { JoinDiagnostics } from '../../network/JoinFailure';
import type { TcpTransportConnection } from '../../network/transport/TcpTransport';
import type { JavaResourcePackState, JavaServerAddress } from './javaResourcePack';
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
    /** The address and port the client dialed, as its handshake names them, which its pack's URL uses. */
    public address?: JavaServerAddress;
    /** The server's resource pack the client loaded, and the one it is answering. */
    public resourcePack?: JavaResourcePackState;
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
    /** The pings that check the client is still there, from its configuration on. */
    public keepAlive?: KeepAlive;
    /**
     * The view distance last asked of the session, which may not have applied yet: a request
     * waits for the input step, and a second one can arrive before it.
     */
    public viewDistance?: number;
    /** The client's settings, as it last sent them. */
    public information?: JavaPayload<typeof ConfigurationClientInformation>;
    /** The name of the client's mod loader or launcher, as its `minecraft:brand` message says, such as `vanilla`. */
    public brand?: string;
    /** Whether the client said it loaded the world around its player, which ends its join. */
    public loaded = false;
    /** Whether the server hung up, rather than the client. */
    public hungUp = false;
    /** The packets last sent to the client, and whether a failed join was reported. */
    public readonly joinDiagnostics = new JoinDiagnostics();

    /**
     * @param transport - The TCP connection the packets travel over.
     * @param log - Where a failure is logged.
     */
    public constructor(
        public readonly transport: TcpTransportConnection,
        private readonly log: Pick<Logger, 'debug' | 'warn'>
    ) {}

    /** Sends one packet, compressed once `Set Compression` has gone. */
    public send<D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): void {
        const packet = encodeJavaPacket(this.protocol, definition, value);
        this.transport.sendFrame(this.compression === undefined ? packet : compressFrame(packet, this.compression));
        this.joinDiagnostics.sent.add(definition.name);
    }

    /** Hangs up. */
    public close(): Promise<void> {
        this.hungUp = true;
        return this.transport.close();
    }

    /**
     * Logs a join that failed through the server's fault, with a link to report it, once per
     * connection. Nothing is reported for a server list ping, nor once the client loaded the world.
     * @param cause - What went wrong, as one sentence.
     * @param error - The error the server threw, when it threw one.
     * @returns Whether it was logged.
     */
    public reportJoinFailure(cause: string, error?: unknown): boolean {
        if (this.loaded || this.phase === 'handshake' || this.phase === 'status') return false;
        const address = this.transport.address.toToken();
        const name = this.profile?.name ?? this.pending?.name;
        return this.joinDiagnostics.report(this.log, name === undefined ? address : `${name} (${address})`, {
            edition: 'Java',
            minecraftVersions: [this.protocol.minecraftVersion],
            protocolVersion: this.protocol.protocolVersion,
            phase: this.phase,
            cause,
            ...(error === undefined ? {} : { error })
        });
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
        this.reportJoinFailure('The server failed to apply what the client sent while it joined.', error);
        await this.close();
    }
}
