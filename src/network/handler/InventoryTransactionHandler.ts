import Vector3 from "../../math/Vector3";
import Player from "../../player";
import Prismarine from "../../Prismarine";
import Identifiers from "../Identifiers";
const Logger = require('../../utils/Logger');

export default class InventoryTransactionHandler {
    static NetID = Identifiers.InventoryTransactionPacket;

    static async handle(packet: any, server: Prismarine, player: Player) {
        // TODO: enum
        switch (packet.type) {
            case 0: // Normal
                // TODO:
                break;
            case 2:  // Use item (build - interact)
                // TODO: sanity checks (can interact)
                // check if gamemode is spectator  
                if (packet.actionType) {
                    switch (packet.actionType) {
                        case 1:  // BUILD
                            let blockPos = new Vector3(packet.blockX, packet.blockY, packet.blockZ);
                            await player.getWorld().useItemOn(
                                packet.itemInHand, blockPos, packet.face, packet.clickPosition, player
                            );
                            break;
                        case 2: // BREAK (Move from action packet)
                            break;
                        default:
                            server.getLogger().debug(`Unknown action type: ${packet.actionType}`);
                    }
                }
                break;
            case 4:
                // TODO: sanity checks (can interact)
                // check if gamemode is spectator
                break;
        }
    }
}
