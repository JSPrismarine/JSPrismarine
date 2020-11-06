import Event from '../Event';

/**
 * Fired just as a client connects to the raknet instance
 */
export default class RaknetConnectEvent extends Event {
    private connection: any;

    constructor(connection: any) {
        super();
        this.connection = connection;
    }

    getConnection(): any {
        return this.connection;
    }
}
