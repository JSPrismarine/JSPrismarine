import Event from "../Event";
import type InetAddress from "../../network/raknet/utils/InetAddress";

export default class RaknetEncapsulatedPacketEvent extends Event {
    private inetAddr: InetAddress;
    private packet: any;

    constructor(inetAddr: InetAddress, packet: any) {
        super();
        this.inetAddr = inetAddr;
        this.packet = packet;
    }

    public getInetAddr(): InetAddress {
        return this.inetAddr;
    }
    public getPacket(): any {
        return this.packet;
    }
};
