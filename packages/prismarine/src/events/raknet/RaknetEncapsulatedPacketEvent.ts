import Event from '../Event';
import type { InetAddress } from '@jsprismarine/raknet';
import { Protocol } from '@jsprismarine/raknet';

export default class RaknetEncapsulatedPacketEvent extends Event {
    private readonly inetAddr: InetAddress;
    private readonly packet: Protocol.EncapsulatedPacket;

    public constructor(inetAddr: InetAddress, packet: Protocol.EncapsulatedPacket) {
        super();
        this.inetAddr = inetAddr;
        this.packet = packet;
    }

    public getInetAddr(): InetAddress {
        return this.inetAddr;
    }

    public getPacket(): Protocol.EncapsulatedPacket {
        return this.packet;
    }
}
