import Event from '../Event';
import type { RakNetSession } from '@jsprismarine/raknet';

/**
 * Fired just as a new client connects to the raknet server instance.
 *
 * @public
 */
export default class RaknetConnectEvent extends Event {
    private readonly session: RakNetSession;

    public constructor(session: RakNetSession) {
        super();
        this.session = session;
    }

    public getRakNetSession(): RakNetSession {
        return this.session;
    }
}
