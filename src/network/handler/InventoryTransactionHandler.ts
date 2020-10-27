<<<<<<< HEAD
import Vector3 from "../../math/vector3";
import type Player from "../../player/Player";
import type Prismarine from "../../Prismarine";
import Identifiers from "../Identifiers";
const Logger = require('../../utils/Logger');
=======
import Vector3 from "../../math/Vector3";
import Identifiers from "../Identifiers";
import type Player from "../../player";
import type Prismarine from "../../Prismarine";
import InventoryTransactionPacket, { InventoryTransactionActionType } from "../packet/InventoryTransactionPacket";
import UpdateBlockPacket from "../packet/UpdateBlockPacket";
import type Block from "../../block";
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e

export default class InventoryTransactionHandler {
    static NetID = Identifiers.InventoryTransactionPacket;

    static async handle(packet: InventoryTransactionPacket, server: Prismarine, player: Player) {
        // TODO: enum
        switch (packet.type) {
            case 0: // Normal
                // TODO:
                break;
            case 2:  // Use item (build - interact)
                // TODO: sanity checks (can interact)
                if (packet.actionType && player.gamemode !== 3) {
                    switch (packet.actionType) {
                        case InventoryTransactionActionType.Build:
                            // TODO: Position isn't decoded properly
                            const blockPos = new Vector3(packet.blockX, packet.blockY, packet.blockZ);
                            await player.getWorld().useItemOn(
                                packet.itemInHand, blockPos, packet.face, packet.clickPosition, player
                            );
                            break;
                        case InventoryTransactionActionType.Break:
                            const chunk = await player.getWorld().getChunkAt(
                                packet.blockX, packet.blockZ
                            );

                            // TODO: figure out why blockId sometimes === 0
                            const chunkPos = new Vector3((packet.blockX as number) % 16, packet.blockY, (packet.blockZ as number) % 16);
                            const blockId = chunk.getBlockId(chunkPos.getX(), chunkPos.getY(), chunkPos.getZ());
                            const blockMeta = chunk.getBlockMetadata(chunkPos.getX(), chunkPos.getY(), chunkPos.getZ());
                            const block = server.getBlockManager().getBlockByIdAndMeta(blockId, blockMeta);

                            if (!block)
                                return server.getLogger().warn(`Block at ${packet.blockX} ${packet.blockY} ${packet.blockZ} is undefined!`);

                            let pk = new UpdateBlockPacket(server);
                            pk.x = packet.blockX;
                            pk.y = packet.blockY;
                            pk.z = packet.blockZ;
                            // TODO: add NBT writing to support our own block palette
                            pk.BlockRuntimeId = (server.getBlockManager().getBlock('minecraft:air') as Block).getRuntimeId();
                            for (let onlinePlayer of server.getOnlinePlayers()) {
                                onlinePlayer.sendDataPacket(pk);
                            }

                            chunk.setBlock(
                                chunkPos.getX(), chunkPos.getY(), chunkPos.getZ(), server.getBlockManager().getBlock('minecraft:air')
                            );
                            break;
                        default:
                            server.getLogger().debug(`Unknown action type: ${packet.actionType}`);
                    }
                }
                break;
            case 4:
                // TODO: sanity checks (can interact)
                break;
        }
    }
}
