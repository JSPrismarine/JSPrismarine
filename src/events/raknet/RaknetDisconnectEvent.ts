import Event from "../Event";

/**
 * Fired just as a client disconnects from the raknet instance
 */
export default class RaknetDisconnectEvent extends Event {
    private inetAddr: any;
    private reason: string;

    constructor(inetAddr: any, reason: string) {
        super();
        this.inetAddr = inetAddr;
        this.reason  = reason;
    }

    public getInetAddr(): any {
        return this.inetAddr;
    }
    public getReason(): string {
        return this.reason;
    }
};
