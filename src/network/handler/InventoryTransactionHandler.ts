import InventoryTransactionPacket, {
    InventoryTransactionType,
    InventoryTransactionUseItemActionType
} from '../packet/InventoryTransactionPacket';

import Gamemode from '../../world/Gamemode';
import LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import UpdateBlockPacket from '../packet/UpdateBlockPacket';
import Vector3 from '../../math/Vector3';

export default class InventoryTransactionHandler
    implements PacketHandler<InventoryTransactionPacket> {
    public handle(
        packet: InventoryTransactionPacket,
        server: Server,
        player: Player
    ): void {
        switch (packet.type) {
            case InventoryTransactionType.Normal: {
                packet.actions.forEach(async (action) => {
                    // TODO: checks?
                    const id = action.newItem.id;
                    const meta = action.newItem.meta;
                    const item =
                        server.getItemManager().getItemById(id) ||
                        server.getBlockManager().getBlockByIdAndMeta(id, meta);

                    if (!item) throw new Error(`Invalid item ${id}:${meta}`);

                    player.getInventory().setItem(action.slot, item);
                });
                break;
            }
            case InventoryTransactionType.UseItem: {
                if (player.gamemode !== Gamemode.Spectator) break;
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
                                packet.blockPosition.getX() % 16,
                                packet.blockPosition.getY(),
                                packet.blockPosition.getZ() % 16
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

                            const pk = new UpdateBlockPacket();
                            pk.x = packet.blockPosition.getX();
                            pk.y = packet.blockPosition.getY();
                            pk.z = packet.blockPosition.getZ();
                            pk.blockRuntimeId = server
                                .getBlockManager()
                                .getRuntimeWithId(0); // Air

                            await Promise.all(
                                server
                                    .getOnlinePlayers()
                                    .map(async (player) =>
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
                                .getRuntimeWithMeta(blockId, blockMeta); // In this case refers to block runtime Id
                            soundPk.entityType = ':';
                            soundPk.isBabyMob = false;
                            soundPk.disableRelativeVolume = false;

                            await Promise.all(
                                player
                                    .getPlayersInChunk()
                                    .map(async (narbyPlayer) =>
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
                                `Unknown action type: ${packet.actionType}`,
                                'InventoryTransactionHandler/handle'
                            );
                }

                break;
            }
            default: {
                server
                    .getLogger()
                    .debug(
                        `Unknown type: ${packet.type}`,
                        'InventoryTransactionHandler/handle'
                    );
                throw new Error('Invalid InventoryTransactionType');
            }
        }
    }
}
