import { Logger, Player, PlayerSession, Server } from '../Prismarine';

import MinecraftSession from './MinecraftSession';
import { RakNetSession } from '@jsprismarine/raknet';
import assert from 'assert';

/**
 * Handles the connection before the player creation itself, very helpful as
 * it helps to not waste resources in case the client trying to connect is simply
 * outdated or sends invalid data during the login handshake.
 */
export default class ClientConnection extends MinecraftSession {
    private readonly rakNetSession: RakNetSession;
    private playerSession: PlayerSession | null = null;

    public constructor(session: RakNetSession, logger?: Logger) {
        super(session, logger);
        this.rakNetSession = session;
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

    public getPlayerSession(): PlayerSession | null {
        return this.playerSession;
    }

    public getRakNetSession(): RakNetSession {
        return this.rakNetSession;
    }
}
