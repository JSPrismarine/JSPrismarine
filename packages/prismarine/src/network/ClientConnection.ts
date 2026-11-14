import type PlayerSession from './PlayerSession';

import type { Logger } from '@jsprismarine/logger';
import type { InetAddress, RakNetSession } from '@jsprismarine/raknet';
import { DisconnectReason } from '@jsprismarine/minecraft';
import assert from 'assert';
import MinecraftSession from './MinecraftSession';
import { DisconnectPacket } from '@jsprismarine/protocol';
import type { PacketLogFilter } from './PacketLogFilter';
import type { SessionPhase } from './SessionPhase';
import { RakNetTransportConnection } from './transport/RakNetTransport';
import type { ConnectionId } from './transport/ConnectionId';
import type { TransportConnection, TransportName } from './transport/Transport';

/**
 * Handles the connection before the player creation itself, very helpful as
 * it helps to not waste resources in case the client trying to connect is simply
 * outdated or sends invalid data during the login handshake.
 */
export default class ClientConnection extends MinecraftSession {
    private playerSession: PlayerSession | null = null;
    public hasCompression = false;

    /**
     * Where this connection stands in the join exchange. Advanced by the handler that
     * completes each step; the dispatcher drops a packet whose handler does not accept
     * the current phase.
     */
    public phase: SessionPhase = 'handshake';

    /**
     * What remains of the login once the client has answered the encryption handshake.
     * Set by `LoginHandler` when it sends `ServerToClientHandshake`, and run once by
     * `ClientToServerHandshakeHandler`.
     */
    public resumeLogin: (() => Promise<void>) | null = null;

    public constructor(
        private readonly transportConnection: TransportConnection,
        logger: Logger,
        logFilter?: PacketLogFilter,
        getCompressionLevel?: () => number,
        getCompressionThreshold?: () => number
    ) {
        super(
            transportConnection,
            logger,
            logFilter,
            undefined,
            undefined,
            undefined,
            getCompressionLevel,
            getCompressionThreshold
        );
    }

    /**
     * @internal
     *
     * Takes ownership of the session built for this connection's player.
     *
     * The session belongs to the connection, which is what the packet dispatcher looks it up
     * on - see `Server`, which routes to `getPlayerSession() ?? this`. It used to be built by
     * the player and merely adopted here, which is what made the player and the session
     * import each other at runtime.
     *
     * @param session - the session built for this connection by `createConnectedPlayer`
     */
    public attachPlayerSession(session: PlayerSession): void {
        assert(this.playerSession === null, 'Player session was already created');

        this.playerSession = session;
    }

    /**
     * Tears the player and its session down together, exactly once.
     *
     * The single teardown entry point: a kick, a transport disconnect and a failed join all
     * arrive here, and whichever gets here first does the work. The session is detached
     * before anything is awaited so that a second caller finds nothing to do. The session's
     * {@link PlayerSession.leave} takes the player down and then itself, even if the player's
     * part fails.
     */
    public closePlayerSession(): void {
        const session = this.playerSession;
        if (session === null) return;

        this.playerSession = null;
        session.leave();
    }

    /**
     * The one way out: tells the client why, releases the player, and hangs up on the transport.
     *
     * Awaitable because the caller may be about to close the socket. `Server.shutdown` kicks
     * everyone immediately before `RakNetListener.kill`, and a goodbye that has not been
     * framed yet when the socket goes is a goodbye nobody receives.
     * @param reason - shown to the client unless `hideReason`.
     * @param hideReason - send the disconnect screen with no message on it.
     * @param code - the `DisconnectReason` the client maps to its disconnect screen's error
     * code. Every server-initiated disconnect used to leave it at `UNKNOWN`.
     */
    public async disconnect(
        reason = 'disconnect.disconnected',
        hideReason = true,
        code: DisconnectReason = DisconnectReason.DISCONNECTED
    ): Promise<void> {
        const packet = new DisconnectPacket({
            reason: code,
            skipMessage: hideReason,
            message: reason,
            filteredMessage: ''
        });

        // The goodbye is queued first and the player taken off after it, and the caller waits
        // for the packet: framing can be queued behind a chunk batch still compressing, so
        // hanging up has to wait for the packet rather than race it - a session RakNet has
        // already dropped never frames anything, and the player would be kicked with no reason
        // shown. RakNet holds the session open until the client acknowledges this, so a lost
        // datagram costs a retransmission rather than the reason. NetherNet waits for the
        // acknowledgement before it hangs up, and `finally` waits for that. Before the network
        // settings exchange nothing is compressed, and a deflated goodbye would be read as
        // garbage by a client that has not agreed to compression yet.
        const goodbye = this.sendDataPacket(packet, this.hasCompression, true).finally(() => this.forceDisconnect());
        try {
            this.closePlayerSession();
        } finally {
            await goodbye;
        }
    }

    public getPlayerSession(): PlayerSession | null {
        return this.playerSession;
    }

    /** The server's ID for this connection, unique across every transport and never reused. */
    public getConnectionId(): ConnectionId {
        return this.transportConnection.id;
    }

    /** Where the client connected from, whichever transport carried it. */
    public getAddress(): InetAddress {
        return this.transportConnection.address;
    }

    /** The transport the client connected over. */
    public getTransport(): TransportName {
        return this.transportConnection.transport;
    }

    /**
     * The RakNet session under the transport seam.
     * @deprecated Use {@link ClientConnection.getAddress} for the client's address. A client that
     * joined over another transport has no RakNet session.
     * @throws {Error} When the client did not connect over RakNet.
     */
    public getRakNetSession(): RakNetSession {
        if (!(this.transportConnection instanceof RakNetTransportConnection)) {
            throw new Error(`Connection ${this.transportConnection.id} did not connect over RakNet`);
        }
        return this.transportConnection.getRakNetSession();
    }
}
