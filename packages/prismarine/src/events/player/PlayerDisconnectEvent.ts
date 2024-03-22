import type { InetAddress } from '@jsprismarine/raknet';
import type Player from '../../Player';
import PlayerConnectEvent from './PlayerConnectEvent';

/**
 * Fired just before a client disconnects from the raknet instance
 */
export default class PlayerDisconnectEvent extends PlayerConnectEvent {
    public constructor(player: Player, inetAddr: InetAddress) {
        super(player, inetAddr);
    }
}
