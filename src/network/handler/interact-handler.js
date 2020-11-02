const Player = require('../../player/Player').default;
const Identifiers = require('../Identifiers').default;
const InteractPacket = require('../packet/interact');
const InteractAction = require('../type/InteractAction').default;
const ContainerOpenPacket = require('../packet/container-open');
const Prismarine = require('../../Prismarine');

class InteractHandler {
    static NetID = Identifiers.InteractPacket

    /**
     * @param {InteractPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        switch (packet.action) {
            case InteractAction.LeaveVehicle:
            case InteractAction.MouseOver:
                break;
            case InteractAction.OpenInventory:
                let pk = new ContainerOpenPacket();
                pk.windowId = 92;  // TODO
                pk.containerType = -1; // -> inventory (TODO)
                pk.containerX = pk.containerY = pk.containerZ = 0;
                pk.containerEntityId = player.runtimeId;
                player.getPlayerConnection().sendDataPacket(pk);
                break;
            default:
                server.getLogger().debug('Unknown interact action id: ' + packet.action);
        }
    }
}
module.exports = InteractHandler;
