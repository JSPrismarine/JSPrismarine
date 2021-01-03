import Event from '../Event';
import type InetAddress from '../../network/raknet/utils/InetAddress';
import type Player from '../../player/Player';

/**
 * Fired just after a client has connected to the raknet instance
 */
export default class PlayerConnectEvent extends Event {
    private readonly player;
    private readonly inetAddr;

    constructor(player: Player, inetAddr: InetAddress) {
        super();
        this.player = player;
        this.inetAddr = inetAddr;
    }

    public getPlayer(): Player {
        return this.player;
    }

    public getInetAddr() {
        return this.inetAddr;
    }
}
