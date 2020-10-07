const Player = require('../../player');
const Identifiers = require('../identifiers');
const PlayerActionPacket = require('../packet/player-action');
const PlayerAction = require('../type/player-action');
const Prismarine = require('../../prismarine');
const WorldEventPacket = require('../packet/world-event');
const LevelEventType = require('../type/level-event-type');

'use strict';

class PlayerActionHandler {
    static NetID = Identifiers.PlayerActionPacket

    /**
     * @param {PlayerActionPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static async handle(packet, server, player) {
        let pk;
        switch (packet.action) {
            case PlayerAction.StartBreak:
                pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStartBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 65535 / (0.6 * 20);
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                } 
                break;
            case PlayerAction.AbortBreak:
            case PlayerAction.StopBreak:
                pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStopBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 0;
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                } 
                let chunk = await player.getWorld().getChunkAt(packet.x, packet.z);
                chunk.setBlockId(packet.x, packet.y, packet.z, 0); 

                // console.log(player.x >> 4, player.z >> 4, chunk.getX(), chunk.getZ())
                break;
            case PlayerAction.ContinueBreak:
                pk = new WorldEventPacket();
                pk.eventId = LevelEventType.ParticlePunchBlock;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 7;  // TODO: runtime ID
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                } 
                break; 
            default:
                // This will get triggered even if an action is simply not handled
                // logger.debug(`Unknown PlayerAction: ${packet.action}`)
        }
    }
}
module.exports = PlayerActionHandler;