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
            if (inventoryAction.oldItem === inventoryAction.newItem)
                return;

            try {
                switch (inventoryAction.sourceType) {
                    case InventoryTransactionSource.Container: {
                        // TODO:
                        if (
                            inventoryAction.windowId === ContainerIds.UI &&
                            inventoryAction.slot > 0
                        ) {
                            if (inventoryAction.slot === 50) return; // Noise
                        }
                        break;
                    }
                    case InventoryTransactionSource.World: {
                        // TODO:
                        break;
                    }
                    case InventoryTransactionSource.Creative: {
                        actions.push(
                            new CreativeInventoryAction(
                                inventoryAction.oldItem,
                                inventoryAction.newItem,
                                inventoryAction.slot
                            )
                        );
                        break;
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
