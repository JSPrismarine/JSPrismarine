import type Player from "../../player";
import type Prismarine from "../../Prismarine";
import type PlayerActionPacket from "../packet/PlayerActionPacket";
import Identifiers from "../Identifiers";
import PlayerAction from "../type/player-action";
import WorldEventPacket from "../packet/WorldEventPacket";
import Vector3 from "../../math/Vector3";
import LevelEventType from "../type/level-event-type";
import UpdateBlockPacket from "../packet/UpdateBlockPacket";
import type Block from "../../block";

class PlayerActionHandler {
    static NetID = Identifiers.PlayerActionPacket

    static async handle(packet: PlayerActionPacket, server: Prismarine, player: Player) {
        switch (packet.action) {
            case PlayerAction.StartBreak: {
                const chunk = await player.getWorld().getChunkAt(
                    packet.x as number, packet.z as number
                );

                const blockId = chunk.getBlockId((packet.x as number) % 15, packet.y, (packet.z as number) % 15);
                const block = server.getBlockManager().getBlockById(blockId);
                if (!block)
                    return server.getLogger().warn(`Block at ${packet.x} ${packet.y} ${packet.z} is undefined!`);

                const breakTime = Math.ceil(block.getBreakTime(null, server) * 20); // TODO: calculate with item in hand

                // TODO: world.sendEvent(type, position(Vector3), data) (?)
                let pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStartBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 65535 / breakTime
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                }

                player.breakingBlockPos = new Vector3(packet.x as number, packet.y as number, packet.z as number);
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
                const chunkPos = new Vector3((blockVector3.getX() as number) % 15, blockVector3.getY(), (blockVector3.getZ() as number) % 15);
                const blockId = chunk.getBlockId(chunkPos.getX(), chunkPos.getY(), chunkPos.getZ());
                const blockMeta = chunk.getBlockMetadata(chunkPos.getX(), chunkPos.getY(), chunkPos.getZ());
                const block = server.getBlockManager().getBlockByIdAndMeta(blockId, blockMeta);

                if (!block)
                    return server.getLogger().warn(`Block at ${blockVector3.getX()} ${blockVector3.getY()} ${blockVector3.getZ()} is undefined!`);

                let pk = new UpdateBlockPacket();
                pk.x = blockVector3.getX();
                pk.y = blockVector3.getY();
                pk.z = blockVector3.getZ();
                // TODO: add NBT writing to support our own block palette
                pk.BlockRuntimeId = (server.getBlockManager().getBlock('minecraft:air') as Block).getRuntimeId();
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.sendDataPacket(pk);
                }

                chunk.setBlock(
                    chunkPos.getX(), chunkPos.getY(), chunkPos.getZ(), server.getBlockManager().getBlock('minecraft:air')
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

                // TODO: this fires twice in creative.. wtf Mojang?
                break;
            } default: {
                // This will get triggered even if an action is simply not handled
                server.getLogger().debug(`Unknown or unhandled PlayerAction: ${packet.action}`);
            }
        }
    }
}
module.exports = PlayerActionHandler;
