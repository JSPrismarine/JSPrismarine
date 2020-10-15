import Player from "../../player";
import Prismarine from "../../prismarine";
import Identifiers from "../identifiers";
const Logger = require('../../utils/Logger');

export default class InventoryTransactionHandler {
    static NetID = Identifiers.InventoryTransactionPacket;

    static handle(packet: any, server: Prismarine, player: Player) {
        // TODO: enum
        switch (packet.type) {
            case 0: // Normal
               // TODO:
               break; 
        }
    }
}