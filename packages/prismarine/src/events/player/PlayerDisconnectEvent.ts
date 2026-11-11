import type { InetAddress } from '@jsprismarine/raknet';
import type { PlayerEventSubject } from './PlayerEvent';
import PlayerConnectEvent from './PlayerConnectEvent';

/**
 * Fired just before a client disconnects from the raknet instance
 */
export default class PlayerDisconnectEvent extends PlayerConnectEvent {
    public constructor(subject: PlayerEventSubject, inetAddr: InetAddress) {
        super(subject, inetAddr);
    }
}
