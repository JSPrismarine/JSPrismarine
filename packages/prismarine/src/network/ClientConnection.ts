import type { PlayerSession } from '../';

import type { Logger } from '@jsprismarine/logger';
import type { RakNetSession } from '@jsprismarine/raknet';
import assert from 'assert';
import MinecraftSession from './MinecraftSession';
import { DisconnectPacket } from './Packets';
import type { PacketLogFilter } from './PacketLogFilter';

/**
 * Handles the connection before the player creation itself, very helpful as
 * it helps to not waste resources in case the client trying to connect is simply
 * outdated or sends invalid data during the login handshake.
 */
export default class ClientConnection extends MinecraftSession {
    private playerSession: PlayerSession | null = null;
    public hasCompression = false;

    public constructor(session: RakNetSession, logger: Logger, logFilter?: PacketLogFilter) {
        super(session, logger, logFilter);
    }

    /**
     * @internal
     *
     * Takes ownership of the session built for this connection's player.
     *
     * The session belongs to the connection, which is what the packet dispatcher looks it up
     * on - see `Server`, which routes to `getPlayerSession() ?? this`. It used to be built by
     * the `Player` and merely adopted here, which is what made the player and the session
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
     * The single teardown entry point: a kick, a RakNet disconnect and a failed join all
     * arrive here, and whichever gets here first does the work. The session is detached
     * before anything is awaited so that a second caller finds nothing to do, and the
     * session's own release runs even if the player's fails.
     */
    public async closePlayerSession(): Promise<void> {
        const session = this.playerSession;
        if (session === null) return;

        this.playerSession = null;

        try {
            await session.getPlayer().disable();
        } finally {
            session.disable();
        }
    }

    /**
     * The one way out: tells the client why, releases the player, and hangs up on RakNet.
     *
     * Awaitable because the caller may be about to close the socket - `kickAllPlayers` runs
     * immediately before `RakNetListener.kill` - and a goodbye that has not been framed yet
     * when the socket goes is a goodbye nobody receives.
     * @param reason - shown to the client unless `hideReason`.
     * @param hideReason - send the disconnect screen with no message on it.
     */
    public async disconnect(reason = 'disconnect.disconnected', hideReason = true): Promise<void> {
        const packet = new DisconnectPacket();
        packet.skipMessage = hideReason;
        packet.message = reason;

        // Both at once, because neither waits on the other, and both awaited so the caller
        // knows the whole tear-down is done. Framing can be queued behind a chunk batch
        // still compressing, so hanging up has to wait for the packet rather than race it -
        // a session RakNet has already dropped never frames anything, and the player would
        // be kicked with no reason shown.
        await Promise.all([
            // RakNet holds the session open until the client acknowledges this, so a lost
            // datagram costs a retransmission rather than the reason.
            this.sendDataPacket(packet).finally(() => this.forceDisconnect()),
            this.closePlayerSession()
        ]);
    }

    public getPlayerSession(): PlayerSession | null {
        return this.playerSession;
    }

    public getRakNetSession(): RakNetSession {
        return this.rakSession;
    }
}
