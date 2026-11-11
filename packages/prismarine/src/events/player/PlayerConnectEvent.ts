import PlayerEvent from './PlayerEvent';
import type { InetAddress } from '@jsprismarine/raknet';
import type PlayerSession from '../../network/PlayerSession';

/**
 * Fired just after a client has connected to the raknet instance
 */
export default class PlayerConnectEvent extends PlayerEvent {
    private readonly inetAddr;

    public constructor(session: PlayerSession, inetAddr: InetAddress) {
        super(session);
        this.inetAddr = inetAddr;
    }

    public getInetAddr() {
        return this.inetAddr;
    }
}
