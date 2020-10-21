import Event from "../Event";
import type Player from "../../player";

/**
 * Fired just after a client has connected to the raknet instance
 */
export default class PlayerConnectEvent extends Event {
    private player;
    private inetAddr;

    constructor(player: Player, inetAddr: {
        address: string,
        port: number
    }) {
        super();
        this.player = player;
        this.inetAddr = inetAddr;
    }

    getPlayer(): Player {
        return this.player;
    }

    getInetAddr() {
        return this.inetAddr;
    }
};
