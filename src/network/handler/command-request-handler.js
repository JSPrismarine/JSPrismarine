const Player = require('../../player').default;
const Prismarine = require('../../Prismarine');
const Identifiers = require('../Identifiers').default;
const CommandRequestPacket = require('../packet/command-request');


class ClientCacheStatusHandler {
    static NetID = Identifiers.CommandRequestPacket

    /**
     * @param {CommandRequestPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        player.getServer().getCommandManager().dispatchCommand(
            player, packet.commandName
        );
    }
}
module.exports = ClientCacheStatusHandler;
