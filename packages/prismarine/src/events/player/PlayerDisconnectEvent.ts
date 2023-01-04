import type { InetAddress } from '@jsprismarine/raknet';
import type Player from '../../player/Player.js';
import PlayerConnectEvent from './PlayerConnectEvent.js';

/**
 * Fired just before a client disconnects from the raknet instance
 */
export default class PlayerDisconnectEvent extends PlayerConnectEvent {
    public constructor(player: Player, inetAddr: InetAddress) {
        super(player, inetAddr);
    }
}
