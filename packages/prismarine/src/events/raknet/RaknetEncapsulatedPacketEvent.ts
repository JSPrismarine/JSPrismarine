import Event from '../Event';
import type { InetAddress } from '@jsprismarine/raknet';
import type { Protocol } from '@jsprismarine/raknet';

export default class RaknetEncapsulatedPacketEvent extends Event {
    private readonly inetAddr: InetAddress;
    private readonly packet: Protocol.Frame;

    public constructor(inetAddr: InetAddress, packet: Protocol.Frame) {
        super();
        this.inetAddr = inetAddr;
        this.packet = packet;
    }

    public getInetAddr(): InetAddress {
        return this.inetAddr;
    }

    public getPacket(): Protocol.Frame {
        return this.packet;
    }
}
