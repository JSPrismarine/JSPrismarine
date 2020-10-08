const Identifiers = require('../identifiers');
const ItemStackRequestPacket = require('../packet/item-stack-request');


class InteractHandler {
    static NetID = Identifiers.ItemStackRequestPacket

    /**
     * @param {ItemStackRequestPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        // TODO handle request
    }
}
module.exports = InteractHandler;
