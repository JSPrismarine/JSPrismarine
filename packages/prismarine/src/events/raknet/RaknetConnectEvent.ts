import { Connection } from '@jsprismarine/raknet';
import Event from '../Event';

/**
 * Fired just as a new client connects to the raknet server instance.
 *
 * @public
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
