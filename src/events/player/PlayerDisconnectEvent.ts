import type Player from "../../player";
import PlayerConnectEvent from "./PlayerConnectEvent";

/**
 * Fired just before a client disconnects from the raknet instance
 */
export default class PlayerDisconnectEvent extends PlayerConnectEvent {
    constructor(player: Player, inetAddr: {
        address: string,
        port: number
    }) {
        super(player, inetAddr);
    }
};
