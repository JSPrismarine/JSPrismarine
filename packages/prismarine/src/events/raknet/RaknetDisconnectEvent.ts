import Event from '../Event';
import type { InetAddress } from '@jsprismarine/raknet';

/**
 * Fired just as a client disconnects from the raknet instance
 */
export default class RaknetDisconnectEvent extends Event {
    private readonly inetAddr: InetAddress;
    private readonly reason: string;

    public constructor(inetAddr: InetAddress, reason: string) {
        super();
        this.inetAddr = inetAddr;
        this.reason = reason;
    }

    public getInetAddr(): InetAddress {
        return this.inetAddr;
    }

    public getReason(): string {
        return this.reason;
    }
}
