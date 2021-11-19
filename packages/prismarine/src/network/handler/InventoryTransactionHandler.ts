import { InventoryTransaction, InventoryTransactionUseItemAction } from '../packet/InventoryTransactionPacket';
import { InventoryTransactionPacket, LevelSoundEventPacket, UpdateBlockPacket } from '../Packets';

import BlockMappings from '../../block/BlockMappings';
import ContainerEntry from '../../inventory/ContainerEntry';
import Gamemode from '../../world/Gamemode';
import Identifiers from '../Identifiers';
import { Item } from '../../entity/Entities';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import Vector3 from '../../math/Vector3';

export default class InventoryTransactionHandler implements PacketHandler<InventoryTransactionPacket> {
    public static NetID = Identifiers.InventoryTransactionPacket;

    public async handle(packet: InventoryTransactionPacket, server: Server, player: Player): Promise<void> {
        if (!player.isOnline()) return;
        if (player.gamemode === Gamemode.Spectator) return; // Spectators shouldn't be able to interact with the world.

        switch (packet.transactionType) {
            case InventoryTransaction.NORMAL: {
                // TODO: refactor this crap.
                // probably base it on https://github.com/pmmp/PocketMine-MP/blob/d19db5d2e44d0925798c288247c3bddb71d23975/src/pocketmine/Player.php#L2399 or something similar.
                let movedItem: ContainerEntry;
                packet.actions.forEach(async (action) => {
                    switch (action.sourceType) {
                        case 0: {
                            // FIXME: Hack for creative inventory
                            if (action.windowId === 124) {
                                // from creative inventory
                                if (player.gamemode !== 1) throw new Error(`Player isn't in creative mode`);

                                const id = action.oldItem.id;
                                const meta = action.oldItem.meta;

                                const item =
                                    server.getItemManager().getItemById(id) ??
                                    server.getBlockManager().getBlockByIdAndMeta(id, meta);
                                const count = 64;

                                movedItem = new ContainerEntry({
                                    item,
                                    count
                                });
                                return;
                            }

                            if (action.newItem.id === 0) {
                                movedItem = player.getInventory().getItem(action.slot);
                                player.getInventory().removeItem(action.slot);
                                return;
                            }

                            if (!movedItem) {
                                server
                                    .getLogger()
                                    ?.debug(`movedItem is undefined`, 'InventoryTransactionHandler/handle/Normal');
                                return;
                            }

                            player.getInventory().setItem(action.slot, movedItem);
                            break;
                        }
                        default:
                            server
                                .getLogger()
                                ?.debug(
                                    `Unknown source type: ${action.sourceType}`,
                                    'InventoryTransactionHandler/handle/Normal'
                                );
                    }
                });
                break;
            }
            case InventoryTransaction.USE_ITEM: {
                switch (packet.actionType) {
                    case InventoryTransactionUseItemAction.CLICK_BLOCK:
                        await player
                            .getWorld()
                            .useItemOn(
                                server
                                    .getBlockManager()
                                    .getBlockByIdAndMeta(packet.itemInHand.getId(), packet.itemInHand.meta),
                                packet.blockPosition,
                                packet.face,
                                packet.clickPosition,
                                player
                            );
                        break;
                    case InventoryTransactionUseItemAction.CLICK_AIR:
                        break;
                    case InventoryTransactionUseItemAction.BREAK_BLOCK: {
                        const chunk = await player
                            .getWorld()
                            .getChunkAt(packet.blockPosition.getX(), packet.blockPosition.getZ());

                        const chunkPos = new Vector3(
                            packet.blockPosition.getX(),
                            packet.blockPosition.getY(),
                            packet.blockPosition.getZ()
                        );

                        const blockId = chunk.getBlock(chunkPos.getX(), chunkPos.getY(), chunkPos.getZ());
                        const block = server.getBlockManager().getBlockByIdAndMeta(blockId.id, blockId.meta);

                        const pk = new UpdateBlockPacket();
                        pk.x = packet.blockPosition.getX();
                        pk.y = packet.blockPosition.getY();
                        pk.z = packet.blockPosition.getZ();
                        // TODO: run a function from block.getBreakConsequences() because
                        // the broken block may place more blocks or run block related code
                        // for example, ice should replace itself with a water source block
                        // in survival
                        pk.blockRuntimeId = BlockMappings.getRuntimeId('minecraft:air'); // Air

                        // Spawn item if player isn't in creative
                        /* 
                        TODO: fix item spawning
                        if (player.getGamemode() !== 'creative') {
                            // TODO: use iteminhand
                            const drops = block.getDrops(null, server);

                            await Promise.all(
                                drops.map(async (block) => {
                                    if (!block) return;

                                    const droppedItem = new Item(
                                        player.getWorld(),
                                        server,
                                        new ContainerEntry({
                                            item: block,
                                            count: 1
                                        })
                                    );
                                    await player.getWorld().addEntity(droppedItem);
                                    await droppedItem.setPosition(packet.blockPosition);
                                })
                            );
                        } 
                        */

                        chunk.setBlock(
                            chunkPos.getX(),
                            chunkPos.getY(),
                            chunkPos.getZ(),
                            server.getBlockManager().getBlock('minecraft:air')! // TODO
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
                        soundPk.disableRelativeVolume = true;

                        // Send block-break packet to all players in the same chunk
                        await Promise.all([
                            player.getPlayersInChunk().map(async (player) => {
                                await player.getConnection().sendDataPacket(soundPk);
                            }),
                            player.getPlayersInChunk().map(async (player) => {
                                await player.getConnection().sendDataPacket(pk);
                            })
                        ]);
                        break;
                    }
                    default:
                        server
                            .getLogger()
                            ?.debug(`Unknown action type: ${packet.actionType}`, 'InventoryTransactionHandler/handle');
                }

                break;
            }
            case InventoryTransaction.USE_ITEM_ON_ENTITY:
                break;
            default: {
                server
                    .getLogger()
                    ?.verbose(`Unknown type: ${packet.transactionType}`, 'InventoryTransactionHandler/handle');
                throw new Error('Invalid InventoryTransactionType');
            }
        }
    }
}
