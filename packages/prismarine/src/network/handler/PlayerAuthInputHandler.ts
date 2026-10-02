import { PlayerAuthInputData } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import InventoryTransactionPacket, { TransactionType } from '../packet/InventoryTransactionPacket';
import ItemStackRequestPacket from '../packet/ItemStackRequestPacket';
import type PlayerAuthInputPacket from '../packet/PlayerAuthInputPacket';
import { PlayerAction } from '../packet/PlayerActionPacket';
import InventoryTransactionHandler from './InventoryTransactionHandler';
import ItemStackRequestHandler from './ItemStackRequestHandler';
import { applyClientMovement } from './MovePlayerHandler';
import type PacketHandler from './PacketHandler';
import PlayerActionHandler from './PlayerActionHandler';

/**
 * The flags that are an action in their own right, and the action each one is.
 *
 * A jump, a sprint and a sneak used to arrive as `PlayerActionPacket`s of their own; with
 * server authoritative movement they are bits in the input, and the actions they map to are
 * the same ones, so they are handled by the same code.
 */
const FLAG_ACTIONS: ReadonlyArray<readonly [PlayerAuthInputData, PlayerAction]> = [
    [PlayerAuthInputData.START_JUMPING, PlayerAction.JUMP],
    [PlayerAuthInputData.START_SPRINTING, PlayerAction.START_SPRINT],
    [PlayerAuthInputData.STOP_SPRINTING, PlayerAction.STOP_SPRINT],
    [PlayerAuthInputData.START_SNEAKING, PlayerAction.START_SNEAK],
    [PlayerAuthInputData.STOP_SNEAKING, PlayerAction.STOP_SNEAK]
];

/** Where an action that concerns no block says it happened. */
const NOWHERE = new BlockPosition(0, 0, 0);

/**
 * Where the player is and what they pressed, every tick.
 *
 * The one packet a real client moves with, and since movement is not simulated here, the
 * server's whole knowledge of where a player is. It carries three more things when the tick
 * had them - block actions, an item use, an inventory request - and each of those has a
 * handler of its own already, written for the packet the same thing arrives in on its own.
 * Nothing is handled twice: the actions go to `PlayerActionHandler`, the transaction to
 * `InventoryTransactionHandler` and the request to `ItemStackRequestHandler`, each wrapped
 * in the packet that handler expects.
 *
 * The order is the client's: movement first, then what was done from that position.
 */
export default class PlayerAuthInputHandler implements PacketHandler<PlayerAuthInputPacket> {
    public static NetID = Identifiers.PlayerAuthInputPacket;

    private readonly actions = new PlayerActionHandler();
    private readonly transactions = new InventoryTransactionHandler();
    private readonly requests = new ItemStackRequestHandler();

    public async handle(packet: PlayerAuthInputPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        if (!player.isOnline()) return;

        await applyClientMovement(server, session, {
            position: packet.position,
            pitch: packet.pitch,
            yaw: packet.yaw,
            headYaw: packet.headYaw,
            // The input has no "on ground" bit. A vertical collision is the nearest thing it
            // says: the ground pushing back, every tick the player stands on it.
            onGround: packet.inputData.has(PlayerAuthInputData.VERTICAL_COLLISION)
        });

        for (const [flag, action] of FLAG_ACTIONS) {
            if (packet.inputData.has(flag)) await this.actions.handleAction(action, NOWHERE, 0, server, session);
        }

        for (const { action, position, face } of packet.blockActions ?? []) {
            await this.actions.handleAction(action, position, face, server, session);
        }

        if (packet.itemUseTransaction !== null) {
            const transaction = new InventoryTransactionPacket();
            transaction.legacyRequestId = packet.itemUseTransaction.legacyRequestId;
            transaction.legacySlotChanges = packet.itemUseTransaction.legacySlotChanges;
            transaction.transactionType = TransactionType.USE_ITEM;
            transaction.inventoryActions = packet.itemUseTransaction.actions;
            transaction.transactionData = packet.itemUseTransaction.data;
            await this.transactions.handle(transaction, server, session);
        }

        if (packet.itemStackRequest !== null) {
            const request = new ItemStackRequestPacket();
            request.requests = [packet.itemStackRequest];
            await this.requests.handle(request, server, session);
        }
    }
}
