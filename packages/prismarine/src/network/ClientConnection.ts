import { Logger, Player, PlayerSession, Server } from '../Prismarine.js';

import { DisconnectPacket } from './Packets.js';
import MinecraftSession from './MinecraftSession.js';
import { SessionV2 } from '@jsprismarine/raknet';
import assert from 'assert';

/**
 * Handles the connection before the player creation itself, very helpful as
 * it helps to not waste resources in case the client trying to connect is simply
 * outdated or sends invalid data during the login handshake.
 */
export default class ClientConnection extends MinecraftSession {
    private playerSession: PlayerSession | null = null;
    public hasCompression = false;

    public constructor(session: SessionV2, logger?: Logger) {
        super(session, logger);
    }

    /**
     * @internal
     *
     * @param server the server instance
     * @param player the player instance
     * @returns the new player session
     */
    public initPlayerConnection(server: Server, player: Player): PlayerSession {
        assert(this.playerSession === null, 'Player session was already created');

        this.playerSession = new PlayerSession(server, this, player);
        return this.playerSession;
    }

    public disconnect(reason = 'disconnect.disconnected', hideReason = true): void {
        const packet = new DisconnectPacket();
        packet.hideDisconnectionWindow = hideReason;
        packet.message = reason;
        void this.sendDataPacket(packet);

        // Force RakNet to remove the session
        // so we don't have to handle the dead session
        // TODO this.rakSession.disconnect();
    }

    public getPlayerSession(): PlayerSession | null {
        return this.playerSession;
    }

    public getRakNetSession(): SessionV2 {
        return this.rakSession;
    }
}
