import PlayerEvent from './PlayerEvent';
import type { InetAddress } from '@jsprismarine/raknet';
import type Player from '../../Player';

/**
 * Fired just after a client has connected to the raknet instance
 */
export default class PlayerConnectEvent extends PlayerEvent {
    private readonly inetAddr;

    public constructor(player: Player, inetAddr: InetAddress) {
        super(player);
        this.inetAddr = inetAddr;
    }

    public getInetAddr() {
        return this.inetAddr;
    }
}
