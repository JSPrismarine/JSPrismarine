import PlayerEvent from './PlayerEvent';
import type { InetAddress } from '@jsprismarine/raknet';
import type { PlayerEventSubject } from './PlayerEvent';

/**
 * Fired just after a client has connected to the raknet instance
 */
export default class PlayerConnectEvent extends PlayerEvent {
    private readonly inetAddr;

    public constructor(subject: PlayerEventSubject, inetAddr: InetAddress) {
        super(subject);
        this.inetAddr = inetAddr;
    }

    public getInetAddr() {
        return this.inetAddr;
    }
}
