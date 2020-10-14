const Player = require('../../player').default;
const Identifiers = require('../identifiers');
const PlayerActionPacket = require('../packet/player-action');
const PlayerAction = require('../type/player-action');
const Prismarine = require('../../prismarine');
const WorldEventPacket = require('../packet/world-event');
const LevelEventType = require('../type/level-event-type');
const Vector3 = require('../../math/vector3').default;


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
                // TODO: world.sendEvent(type, psoition(Vector3), data) (?)
                pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStartBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 65535 / (0.6 * 20);  
                // TODO: all break times or 
                // my hack will not work properly
                // (0.6 is dirt break time)
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                } 

                player.breakingBlockPos = new Vector3(packet.x, packet.y, packet.z);
                break;
            case PlayerAction.AbortBreak:
                // Gets called when player didn't finished 
                // to break the block
                pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStopBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 0;
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                } 

                player.breakingBlockPos = null;
                break;
            case PlayerAction.StopBreak:
                // Doesn't send block position, so we 
                // save it on the player (best temp solution)
                if (player.breakingBlockPos !== null) {
                    let blockVector3 = player.breakingBlockPos;
                    let chunk = await player.getWorld().getChunkAt(
                        blockVector3.getX(), blockVector3.getZ()
                    );
                    chunk.setBlockId(
                        blockVector3.getX(), blockVector3.getY(), blockVector3.getZ(), 0
                    ); 
                }
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
