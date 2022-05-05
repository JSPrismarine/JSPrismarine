import { Logger, Player, PlayerConnection, Server } from '../Prismarine';

import Connection from './Connection';
import { RakNetSession } from '@jsprismarine/raknet';

/**
 * This is used to handle the connection before the player creation itself,
 * so it may help to not waste resources in case the client trying to connect is
 * simply outdated or doesn't pass all tests in the LoginHandler.
 */
export default class ClientConnection extends Connection {
    private readonly session: RakNetSession;

    public constructor(session: RakNetSession, logger?: Logger) {
        super(session, logger);
        this.session = session;
    }

    public initPlayerConnection(server: Server, player: Player): PlayerConnection {
        return new PlayerConnection(server, this.session, player);
    }

    public getRakNetSession(): RakNetSession {
        return this.session;
    }
}
