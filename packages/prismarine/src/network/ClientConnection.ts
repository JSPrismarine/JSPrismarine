import type { Player, Server } from '../';
import { PlayerSession } from '../';

import type { Logger } from '@jsprismarine/logger';
import type { RakNetSession } from '@jsprismarine/raknet';
import assert from 'assert';
import MinecraftSession from './MinecraftSession';
import { DisconnectPacket } from './Packets';

/**
 * Handles the connection before the player creation itself, very helpful as
 * it helps to not waste resources in case the client trying to connect is simply
 * outdated or sends invalid data during the login handshake.
 */
export default class ClientConnection extends MinecraftSession {
    private playerSession: PlayerSession | null = null;
    public hasCompression = false;

    public constructor(session: RakNetSession, logger: Logger) {
        super(session, logger);
    }

    /**
     * @internal
     *
     * @param server - the server instance
     * @param player - the player instance
     * @returns the new player session
     */
    public initPlayerConnection(server: Server, player: Player): PlayerSession {
        assert(this.playerSession === null, 'Player session was already created');

        this.playerSession = new PlayerSession(server, this, player);
        return this.playerSession;
    }

    public async closePlayerSession(): Promise<void> {
        if (this.playerSession !== null) {
            await this.playerSession.getPlayer().disable();
            this.playerSession = null;
        }
    }

    public disconnect(reason = 'disconnect.disconnected', hideReason = true): void {
        const packet = new DisconnectPacket();
        packet.skipMessage = hideReason;
        packet.message = reason;
        void this.sendDataPacket(packet);

        this.closePlayerSession();

        // Force RakNet to remove the session
        // so we don't have to handle the dead session
        this.forceDisconnect();
    }

    public getPlayerSession(): PlayerSession | null {
        return this.playerSession;
    }

    public getRakNetSession(): RakNetSession {
        return this.rakSession;
    }
}
