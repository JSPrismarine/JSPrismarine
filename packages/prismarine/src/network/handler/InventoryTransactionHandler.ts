import { Gametype } from '@jsprismarine/minecraft';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import { BlockMappings } from '../../block/BlockMappings';
import Identifiers from '../Identifiers';
import type { InventoryTransactionPacket } from '../Packets';
import { LevelSoundEventPacket, UpdateBlockPacket } from '../Packets';
import type { UseItemData } from '../packet/InventoryTransactionPacket';
import { TransactionType, UseItemAction } from '../packet/InventoryTransactionPacket';
import type PacketHandler from './PacketHandler';

export default class InventoryTransactionHandler implements PacketHandler<InventoryTransactionPacket> {
    public static NetID = Identifiers.InventoryTransactionPacket;

    public async handle(packet: InventoryTransactionPacket, server: Server, connection: PlayerSession): Promise<void> {
        const player = connection.getPlayer();
        if (!player.isOnline()) return;
        if (player.gamemode === Gametype.SPECTATOR) return; // Spectators shouldn't be able to interact with the world.

        switch (packet.transactionType) {
            case TransactionType.NORMAL: {
                // TODO: refactor this crap.
                // probably base it on https://github.com/pmmp/PocketMine-MP/blob/d19db5d2e44d0925798c288247c3bddb71d23975/src/pocketmine/Player.php#L2399 or something similar.
                // let movedItem: ContainerEntry | null;
                packet.inventoryActions.forEach(async (action) => {
                    switch (action.sourceType) {
                        case 0: {
                            // FIXME: Hack for creative inventory
                            /*if (action.windowId === 124) {
                                // from creative inventory
                                if (player.gamemode !== 1) throw new Error(`Player isn't in creative mode`);

                                // const id = action.oldItem.getId();
                                // const meta = action.oldItem.meta;

                                // const item =
                                //    server.getItemManager().getItemById(id) ??
                                //    server.getBlockManager().getBlockByIdAndMeta(id, meta);
                                // const count = 64;

                                // movedItem = new ContainerEntry({
                                //    item,
                                //    count
                                // });
                                return;
                            }

                            if (action.newItem.getId() === 0) {
                                // movedItem = player.getInventory().getItem(action.targetSlot);
                                player.getInventory().removeItem(action.targetSlot);
                                return;
                            }

                            if (!movedItem) {
                                server.getLogger().debug(`movedItem is undefined`);
                                return;
                            }

                            player.getInventory().setItem(action.targetSlot, movedItem);*/
                            break;
                        }
                        default:
                            server.getLogger().debug(`Unknown source type: ${action.sourceType}`);
                    }
                });
                break;
            }
            case TransactionType.USE_ITEM: {
                const useItemData = <UseItemData>packet.transactionData;
                switch (useItemData.actionType) {
                    case UseItemAction.CLICK_BLOCK:
                        await player
                            .getWorld()
                            .useItemOn(
                                server
                                    .getBlockManager()
                                    .getBlockByIdAndMeta(useItemData.itemInHand.getId(), useItemData.itemInHand.meta),
                                useItemData.blockPosition,
                                useItemData.blockFace,
                                useItemData.clickPosition,
                                player
                            );
                        break;
                    case UseItemAction.CLICK_AIR:
                        break;
                    case UseItemAction.BREAK_BLOCK: {
                        const chunk = await player.getWorld().getChunkAt(useItemData.blockPosition);

                        const blockId = chunk.getBlock(useItemData.blockPosition);
                        const block = server.getBlockManager().getBlockByIdAndMeta(blockId.id, blockId.meta);
                        if (!block) return;

                        const pk = new UpdateBlockPacket();
                        pk.x = useItemData.blockPosition.getX();
                        pk.y = useItemData.blockPosition.getY();
                        pk.z = useItemData.blockPosition.getZ();
                        // TODO: run a function from block.getBreakConsequences() because
                        // the broken block may place more blocks or run block related code
                        // for example, ice should replace itself with a water source block
                        // in survival
                        pk.blockRuntimeId = BlockMappings.getRuntimeId('minecraft:air'); // Air

                        // Send block-break packet to all players in the same world
                        await Promise.all(
                            server
                                .getSessionManager()
                                .getAllPlayers()
                                .filter((p) => p.getWorld().getUUID() === player.getWorld().getUUID())
                                .map(async (player) => player.getNetworkSession().getConnection().sendDataPacket(pk))
                        );

                        const chunkPos = useItemData.blockPosition;
                        chunk.setBlock(
                            chunkPos.getX(),
                            chunkPos.getY(),
                            chunkPos.getZ(),
                            server.getBlockManager().getBlock('minecraft:air')!
                        );

                        const soundPk = new LevelSoundEventPacket();
                        soundPk.sound = 5; // TODO: enum

                        soundPk.positionX = player.getX();
                        soundPk.positionY = player.getY();
                        soundPk.positionZ = player.getZ();

                        // ? 0 or id & 0xf
                        soundPk.extraData = BlockMappings.getRuntimeId(block.getName()); // In this case refers to block runtime Id
                        soundPk.entityType = ':';
                        soundPk.isBabyMob = false;
                        soundPk.disableRelativeVolume = false;

                        await Promise.all(
                            player
                                .getWorld()
                                .getPlayers()
                                .map((target) => target.getNetworkSession().send(soundPk))
                        );
                        break;
                    }
                    default: {
                        server.getLogger().debug(`Unknown action type: ${useItemData.actionType}`);
                    }
                }

                break;
            }
            default: {
                server.getLogger().verbose(`Unknown type: ${packet.transactionType}`);
                throw new Error('Invalid InventoryTransactionType');
            }
        }
    }
}
