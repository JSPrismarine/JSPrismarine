import Vector3 from '../../math/Vector3';
import Identifiers from '../Identifiers';
import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import InventoryTransactionPacket, {
    InventoryTransactionActionType,
    InventoryTransactionType
} from '../packet/InventoryTransactionPacket';
import UpdateBlockPacket from '../packet/UpdateBlockPacket';
import type Block from '../../block/Block';
import Gamemode from '../../world/Gamemode';

export default class InventoryTransactionHandler {
    static NetID = Identifiers.InventoryTransactionPacket;

    static async handle(
        packet: InventoryTransactionPacket,
        server: Prismarine,
        player: Player
    ) {
        switch (packet.type) {
            case InventoryTransactionType.UseItem:
                // TODO: sanity checks (can interact)
                if (
                    packet.actionType &&
                    player.gamemode !== Gamemode.Spectator
                ) {
                    switch (packet.actionType) {
                        case InventoryTransactionActionType.Build:
                            // TODO: Position isn't decoded properly
                            await player
                                .getWorld()
                                .useItemOn(
                                    server
                                        .getBlockManager()
                                        .getBlockByIdAndMeta(
                                            packet.itemInHand.id,
                                            packet.itemInHand.meta
                                        ),
                                    packet.blockPosition,
                                    packet.face,
                                    packet.clickPosition,
                                    player
                                );
                            break;
                        case InventoryTransactionActionType.Break:
                            const chunk = await player
                                .getWorld()
                                .getChunkAt(
                                    packet.blockPosition.getX(),
                                    packet.blockPosition.getZ()
                                );

                            // TODO: figure out why blockId sometimes === 0
                            const chunkPos = new Vector3(
                                (packet.blockPosition.getX() as number) % 16,
                                packet.blockPosition.getY(),
                                (packet.blockPosition.getZ() as number) % 16
                            );
                            const blockId = chunk.getBlockId(
                                chunkPos.getX(),
                                chunkPos.getY(),
                                chunkPos.getZ()
                            );
                            const blockMeta = chunk.getBlockMetadata(
                                chunkPos.getX(),
                                chunkPos.getY(),
                                chunkPos.getZ()
                            );
                            const block = server
                                .getBlockManager()
                                .getBlockByIdAndMeta(blockId, blockMeta);

                            if (!block)
                                return server
                                    .getLogger()
                                    .warn(
                                        `Block at ${packet.blockPosition.getX()} ${packet.blockPosition.getY()} ${packet.blockPosition.getZ()} is undefined!`
                                    );

                            let pk = new UpdateBlockPacket();
                            pk.x = packet.blockPosition.getX();
                            pk.y = packet.blockPosition.getY();
                            pk.z = packet.blockPosition.getZ();
                            pk.BlockRuntimeId = (server
                                .getBlockManager()
                                .getBlock(
                                    'minecraft:air'
                                ) as Block).getRuntimeId();
                            for (let onlinePlayer of server.getOnlinePlayers()) {
                                onlinePlayer
                                    .getPlayerConnection()
                                    .sendDataPacket(pk);
                            }

                            chunk.setBlock(
                                chunkPos.getX(),
                                chunkPos.getY(),
                                chunkPos.getZ(),
                                server
                                    .getBlockManager()
                                    .getBlock('minecraft:air')
                            );
                            break;
                        default:
                            server
                                .getLogger()
                                .debug(
                                    `Unknown action type: ${packet.actionType}`
                                );
                    }
                }
                break;
        }
    }
}
