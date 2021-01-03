import EncapsulatedPacket from '../../network/raknet/protocol/EncapsulatedPacket';
import Event from '../Event';
import type InetAddress from '../../network/raknet/utils/InetAddress';

export default class RaknetEncapsulatedPacketEvent extends Event {
    private readonly inetAddr: InetAddress;
    private readonly packet: EncapsulatedPacket;

    constructor(inetAddr: InetAddress, packet: EncapsulatedPacket) {
        super();
        this.inetAddr = inetAddr;
        this.packet = packet;
    }

    public getInetAddr(): InetAddress {
        return this.inetAddr;
    }

    public getPacket(): EncapsulatedPacket {
        return this.packet;
    }
}
