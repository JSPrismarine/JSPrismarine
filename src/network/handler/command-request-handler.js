const Player = require('../../player');
const Prismarine = require('../../prismarine');
const Identifiers = require('../identifiers');
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
