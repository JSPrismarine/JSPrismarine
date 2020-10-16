const Player = require('../../player/Player').default;
const Prismarine = require('../../Prismarine');
const Identifiers = require('../identifiers');
const ContainerClosePacket = require('../packet/container-close');


class ContainerCloseHandler {
    static NetID = Identifiers.ContainerClosePacket

    /**
     * @param {ContainerClosePacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        let pk = new ContainerClosePacket();
        pk.windowId = packet.windowId;
        player.sendDataPacket(pk);

        // TODO: event
    }
}
module.exports = ContainerCloseHandler;
