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
import CreativeInventoryAction from '../../inventory/CreativeInventoryAction';
import InventoryAction from '../../inventory/InventoryAction';
import InventoryTransaction from '../../inventory/InventoryTransaction';
import ContainerIds from '../../inventory/ContainerIds';
import SlotChangeInventoryAction from '../../inventory/SlotChangeInventoryAction';

export enum InventoryTransactionSource {
    Container = 0,
    World = 2,
    Creative = 3,

    // According PMMP the following window Ids are fake ids used to
    // track client-side actions and are expected to be changed/updated soon-ish.

    CraftingResult = -4,
    CraftingUseIngredient = -5,
    AnvilResult = -12,
    AnvilOutput = -13,
    EnchantOutput = -17
    // TODO: the rest of 'em
}

export default class InventoryTransactionHandler
    implements PacketHandler<InventoryTransactionPacket> {
    public async handle(
        packet: InventoryTransactionPacket,
        server: Server,
        player: Player
    ): Promise<void> {
        const actions: InventoryAction[] = [];
        packet.actions.forEach((inventoryAction) => {
            if (inventoryAction.oldItem === inventoryAction.newItem) return;

            try {
                switch (inventoryAction.sourceType) {
                    case InventoryTransactionSource.Container: {
                        // TODO:
                        if (
                            inventoryAction.windowId === ContainerIds.UI &&
                            inventoryAction.slot > 0
                        ) {
                            if (inventoryAction.slot === 50) return; // Noise

                            // TODO: some crafting thingy??
                        } else {
                            const window = player
                                .getWindows()
                                .getWindow(inventoryAction.windowId);
                            if (!window)
                                throw new Error(
                                    `Player ${player.getUsername()} has no open container with id ${
                                        inventoryAction.windowId
                                    }`
                                );

                            actions.push(
                                new SlotChangeInventoryAction(
                                    inventoryAction.oldItem,
                                    inventoryAction.newItem,
                                    window,
                                    inventoryAction.slot
                                )
                            );
                        }
                        break;
                    }
                    case InventoryTransactionSource.World: {
                        // TODO: drop-item
                        break;
                    }
                    case InventoryTransactionSource.Creative: {
                        const oldItem =
                            server
                                .getBlockManager()
                                .getBlockByIdAndMeta(
                                    inventoryAction.oldItem.id,
                                    inventoryAction.oldItem.meta
                                ) ??
                            server
                                .getItemManager()
                                .getItemById(inventoryAction.oldItem.id);
                        if (!oldItem)
                            throw new Error(
                                `Invalid item/block with id ${inventoryAction.oldItem.id}:${inventoryAction.oldItem.meta}`
                            );

                        const newItem =
                            server
                                .getBlockManager()
                                .getBlockByIdAndMeta(
                                    inventoryAction.newItem.id,
                                    inventoryAction.newItem.meta
                                ) ??
                            server
                                .getItemManager()
                                .getItemById(inventoryAction.newItem.id);
                        if (!newItem)
                            throw new Error(
                                `Invalid item/block with id ${inventoryAction.newItem.id}:${inventoryAction.newItem.meta}`
                            );

                        actions.push(
                            new CreativeInventoryAction(
                                new ContainerEntry({
                                    item: oldItem,
                                    count: 64
                                }),
                                new ContainerEntry({
                                    item: oldItem,
                                    count: 64
                                }),
                                inventoryAction.slot
                            )
                        );
                        break;
                    }
                    default: {
                        throw new Error(
                            `Invalid source type ${inventoryAction.sourceType}`
                        );
                    }
                }
            } catch (err) {
                server
                    .getLogger()
                    .debug(
                        `Unhandled inventory action from ${player.getUsername()}: ${err}`,
                        'InventoryTransactionHandler/handle'
                    );
                server
                    .getLogger()
                    .silly(err.stack, 'InventoryTransactionHandler/handle');
            }
        });

        console.log(actions);

        switch (packet.type) {
            case InventoryTransactionType.Normal: {
                const transaction = new InventoryTransaction(player, actions);
                try {
                    await transaction.handle();
                } catch (err) {
                    server
                        .getLogger()
                        .debug(
                            `Failed to handle InventoryTransaction from ${player.getUsername()}: ${err}`,
                            'InventoryTransactionHandler/handle/Normal'
                        );
                    server
                        .getLogger()
                        .silly(
                            err.stack,
                            'InventoryTransactionHandler/handle/Normal'
                        );
                }
                return;
            }
        }
    }
}
