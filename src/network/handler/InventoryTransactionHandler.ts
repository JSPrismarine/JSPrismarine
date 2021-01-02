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
import ContainerEntry from '../../inventory/ContainerEntry';

export default class InventoryTransactionHandler
    implements PacketHandler<InventoryTransactionPacket> {
    public handle(
        packet: InventoryTransactionPacket,
        server: Server,
        player: Player
    ): void {
        switch (packet.type) {
            case InventoryTransactionType.Normal: {
                // TODO: refactor this crap
                // <rant> probably base it on https://github.com/pmmp/PocketMine-MP/blob/d19db5d2e44d0925798c288247c3bddb71d23975/src/pocketmine/Player.php#L2399 or something smilar
                // I'm apparently too dumb to figure out how this works. Or maybe I'm just tiered.
                // anyways, fuck 2020. yay 2021. </rant>
                let movedItem: ContainerEntry;
                packet.actions.forEach(async (action) => {
                    switch (action.sourceType) {
                        case 0: {
                            // FIXME: Hack for creative inventory
                            if (action.windowId === 124) {
                                // from creative inventory
                                if (player.gamemode !== 1)
                                    throw new Error(
                                        `Player isn't in creative mode`
                                    );

                                const id = action.oldItem.id;
                                const meta = action.oldItem.meta;
                                const item =
                                    server.getItemManager().getItemById(id) ||
                                    server
                                        .getBlockManager()
                                        .getBlockByIdAndMeta(id, meta);
                                const count = 64;

                                if (!item)
                                    throw new Error(
                                        `Invalid item ${id}:${meta}`
                                    );

                                movedItem = new ContainerEntry({
                                    item,
                                    count
                                });
                                return;
                            }

                            if (action.newItem.id === 0) {
                                movedItem = player
                                    .getInventory()
                                    .getItem(action.slot);
                                player.getInventory().removeItem(action.slot);
                                return;
                            }

                            if (!movedItem) {
                                server
                                    .getLogger()
                                    .debug(
                                        `movedItem is undefined`,
                                        'InventoryTransactionHandler/handle/Normal'
                                    );
                                return;
                            }

                            player
                                .getInventory()
                                .setItem(action.slot, movedItem);
                            break;
                        }
                        default:
                            server
                                .getLogger()
                                .debug(
                                    `Unknown source type: ${action.sourceType}`,
                                    'InventoryTransactionHandler/handle/Normal'
                                );
                    }
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
                            /* const blockMeta = chunk.getBlockMetadata(
                                chunkPos.getX(),
                                chunkPos.getY(),
                                chunkPos.getZ()
                            ); */
                            const block = server
                                .getBlockManager()
                                .getBlockById(blockId);

                            if (!block) {
                                server
                                    .getLogger()
                                    .warn(
                                        `Block at ${packet.blockPosition.getX()} ${packet.blockPosition.getY()} ${packet.blockPosition.getZ()} is undefined!`
                                    );
                                return;
                            }

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
                                    .getBlock('minecraft:air')!
                            );

                            const soundPk = new LevelSoundEventPacket();
                            soundPk.sound = 5; // TODO: enum

                            soundPk.positionX = player.getX();
                            soundPk.positionY = player.getY();
                            soundPk.positionZ = player.getZ();

                            soundPk.extraData = server
                                .getBlockManager()
                                .getRuntimeWithId(blockId); // In this case refers to block runtime Id
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
