const Identifiers = require('../identifiers');
const ItemStackRequestPacket = require('../packet/item-stack-request');


class ItemStackRequestHandler {
    static NetID = Identifiers.ItemStackRequestPacket

    /**
     * @param {ItemStackRequestPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        console.log(packet);
    }
}
module.exports = ItemStackRequestHandler;
