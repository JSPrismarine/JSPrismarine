import PlayerConnectEvent from './PlayerConnectEvent';
import type InetAddress from '../../network/raknet/utils/InetAddress';
import type Player from '../../player/Player';

/**
 * Fired just before a client disconnects from the raknet instance
 */
export default class PlayerDisconnectEvent extends PlayerConnectEvent {
    constructor(player: Player, inetAddr: InetAddress) {
        super(player, inetAddr);
    }
}
