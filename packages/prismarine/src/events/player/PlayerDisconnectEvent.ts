import type { InetAddress } from '@jsprismarine/raknet';
import type PlayerSession from '../../network/PlayerSession';
import PlayerConnectEvent from './PlayerConnectEvent';

/**
 * Fired just before a client disconnects from the raknet instance
 */
export default class PlayerDisconnectEvent extends PlayerConnectEvent {
    public constructor(session: PlayerSession, inetAddr: InetAddress) {
        super(session, inetAddr);
    }
}
