import InventoryTransactionPacket, {
    InventoryTransactionType,
    InventoryTransactionUseItemActionType
} from '../packet/InventoryTransactionPacket';

import Gamemode from '../../world/Gamemode';
import LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import UpdateBlockPacket from '../packet/UpdateBlockPacket';
import Vector3 from '../../math/Vector3';

export default class InventoryTransactionHandler
    implements PacketHandler<InventoryTransactionPacket> {
    public handle(
        packet: InventoryTransactionPacket,
        server: Prismarine,
        player: Player
    ): void {
        switch (packet.type) {
            case InventoryTransactionType.UseItem:
                if (player.gamemode !== Gamemode.Spectator) {
                    switch (packet.actionType) {
                        case InventoryTransactionUseItemActionType.ClickBlock:
                            (async () => {
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
                            })();
                            break;
                        case InventoryTransactionUseItemActionType.ClickAir:
                            break;
                        case InventoryTransactionUseItemActionType.BreakBlock:
                            (async () => {
                                const chunk = await player
                                    .getWorld()
                                    .getChunkAt(
                                        packet.blockPosition.getX(),
                                        packet.blockPosition.getZ()
                                    );

                                // TODO: figure out why blockId sometimes === 0
                                const chunkPos = new Vector3(
                                    (packet.blockPosition.getX() as number) %
                                        16,
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

                                if (block == null) {
                                    return server
                                        .getLogger()
                                        .warn(
                                            `Block at ${packet.blockPosition.getX()} ${packet.blockPosition.getY()} ${packet.blockPosition.getZ()} is undefined!`
                                        );
                                }

                                const pk = new UpdateBlockPacket();
                                pk.x = packet.blockPosition.getX();
                                pk.y = packet.blockPosition.getY();
                                pk.z = packet.blockPosition.getZ();
                                pk.blockRuntimeId = server
                                    .getBlockManager()
                                    .getRuntimeWithId(0); // Air

                                Promise.all(
                                    server
                                        .getOnlinePlayers()
                                        .map((player) =>
                                            player
                                                .getConnection()
                                                .sendDataPacket(pk)
                                        )
                                );

                                chunk.setBlock(
                                    chunkPos.getX(),
                                    chunkPos.getY(),
                                    chunkPos.getZ(),
                                    server
                                        .getBlockManager()
                                        .getBlock('minecraft:air')
                                );

                                const soundPk = new LevelSoundEventPacket();
                                soundPk.sound = 5; // TODO: enum

                                soundPk.positionX = player.getX();
                                soundPk.positionY = player.getY();
                                soundPk.positionZ = player.getZ();

                                soundPk.extraData = server
                                    .getBlockManager()
                                    .getRuntimeWithMeta(blockId, blockMeta); // in this case refers to block runtime Id
                                soundPk.entityType = ':';
                                soundPk.isBabyMob = false;
                                soundPk.disableRelativeVolume = false;

                                Promise.all(
                                    player
                                        .getPlayersInChunk()
                                        .map((narbyPlayer) =>
                                            narbyPlayer
                                                .getConnection()
                                                .sendDataPacket(soundPk)
                                        )
                                );
                            })();
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
