const Player = require('../../player').default;
const Identifiers = require('../identifiers');
const PlayerActionPacket = require('../packet/player-action');
const PlayerAction = require('../type/player-action');
const Prismarine = require('../../Prismarine');
const WorldEventPacket = require('../packet/world-event');
const LevelEventType = require('../type/level-event-type');
const Vector3 = require('../../math/vector3').default;
const UpdateBlockPacket = require('../packet/UpdateBlockPacket').default;

class PlayerActionHandler {
    static NetID = Identifiers.PlayerActionPacket

    /**
     * @param {PlayerActionPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static async handle(packet, server, player) {
        switch (packet.action) {
            case PlayerAction.StartBreak: {
                const chunk = await player.getWorld().getChunkAt(
                    packet.x, packet.z
                );
                const block = server.getBlockManager().getBlockById(chunk.getBlockId(packet.x, packet.y, packet.z));
                const breakTime = player.gamemode === 1 ? 0 : block.getBreakTime(null, server); // TODO: calculate with item in hand

                // TODO: world.sendEvent(type, position(Vector3), data) (?)
                let pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStartBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 65535 / (breakTime * 20);
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                }

                player.breakingBlockPos = new Vector3(packet.x, packet.y, packet.z);
                break;
            } case PlayerAction.AbortBreak:
                // Gets called when player didn't finished 
                // to break the block
                let pk = new WorldEventPacket();
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
            case PlayerAction.StopBreak: {
                // Doesn't send block position, so we 
                // save it on the player (best temp solution)
                if (!player.breakingBlockPos)
                    return;

                // TODO: player.breakBlock
                const blockVector3 = player.breakingBlockPos;
                const chunk = await player.getWorld().getChunkAt(
                    blockVector3.getX(), blockVector3.getZ()
                );
                
                // TODO: figure out why blockId sometimes === 0
                // Appears to happen
                const blockId = chunk.getBlockId(blockVector3.getX() % 16, blockVector3.getY(), blockVector3.getZ() % 16);
                const block = server.getBlockManager().getBlockById(blockId);

                let pk = new UpdateBlockPacket();
                pk.x = blockVector3.getX();
                pk.y = blockVector3.getY();
                pk.z = blockVector3.getZ();
                pk.BlockRuntimeId = block.getRuntimeId(); // TODO: add NBT writing to support our own block palette
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                }

                chunk.setBlock(
                    blockVector3.getX() % 16, blockVector3.getY(), blockVector3.getZ() % 16, server.getBlockManager().getBlock('minecraft:air')
                );
                break;
            } case PlayerAction.ContinueBreak: {
                let pk = new WorldEventPacket();
                pk.eventId = LevelEventType.ParticlePunchBlock;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 7;  // TODO: runtime ID

                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                }
                break;
            } default:
                // This will get triggered even if an action is simply not handled
                // server.getLogger().debug(`Unknown PlayerAction: ${packet.action}`)
        }
    }
}
module.exports = PlayerActionHandler;
