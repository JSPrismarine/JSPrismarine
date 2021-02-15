import Connection from '@jsprismarine/raknet/src/dist/Connection';
import Event from '../Event';

/**
 * Fired just as a client connects to the raknet instance
 */
export default class RaknetConnectEvent extends Event {
    private readonly connection: Connection;

    public constructor(connection: Connection) {
        super();
        this.connection = connection;
    }

    public getConnection(): Connection {
        return this.connection;
    }
}
