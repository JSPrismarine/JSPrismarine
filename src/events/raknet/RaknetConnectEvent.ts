import Connection from '../../network/raknet/Connection';
import Event from '../Event';

/**
 * Fired just as a client connects to the raknet instance
 */
export default class RaknetConnectEvent extends Event {
    private readonly connection: Connection;

    constructor(connection: Connection) {
        super();
        this.connection = connection;
    }

    getConnection(): Connection {
        return this.connection;
    }
}
