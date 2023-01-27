import Event from '../Event.js';
import type { InetAddress } from '@jsprismarine/raknet';

export default class RaknetEncapsulatedPacketEvent extends Event {
    private readonly inetAddr: InetAddress;
    private readonly packet: Buffer;

    public constructor(inetAddr: InetAddress, packet: Buffer) {
        super();
        this.inetAddr = inetAddr;
        this.packet = packet;
    }

    public getInetAddr(): InetAddress {
        return this.inetAddr;
    }

    public getPacket(): Buffer {
        return this.packet;
    }
}
