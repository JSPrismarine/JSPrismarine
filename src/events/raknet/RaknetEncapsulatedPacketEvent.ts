import Event from "../Event";

export default class RaknetEncapsulatedPacketEvent extends Event {
    private inetAddr: any;
    private packet: any;

    constructor(inetAddr: any, packet: any) {
        super();
        this.inetAddr = inetAddr;
        this.packet  = packet;
    }

    public getInetAddr(): any {
        return this.inetAddr;
    }
    public getPacket(): any {
        return this.packet;
    }
};
