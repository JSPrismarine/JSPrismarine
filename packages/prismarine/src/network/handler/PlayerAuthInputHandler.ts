import type { Vector3 } from '@jsprismarine/math';
import { PlayerAuthInputData } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import InventoryTransactionPacket, { TransactionType } from '../packet/InventoryTransactionPacket';
import ItemStackRequestPacket from '../packet/ItemStackRequestPacket';
import type PlayerAuthInputPacket from '../packet/PlayerAuthInputPacket';
import { ClientPlayMode, InputMode, NewInteractionModel } from '../packet/PlayerAuthInputPacket';
import { PlayerActionType } from '../packet/PlayerActionPacket';
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
const FLAG_ACTIONS: ReadonlyArray<readonly [PlayerAuthInputData, PlayerActionType]> = [
    [PlayerAuthInputData.START_JUMPING, PlayerActionType.StartJump],
    [PlayerAuthInputData.START_SPRINTING, PlayerActionType.StartSprinting],
    [PlayerAuthInputData.STOP_SPRINTING, PlayerActionType.StopSprinting],
    [PlayerAuthInputData.START_SNEAKING, PlayerActionType.StartSneaking],
    [PlayerAuthInputData.STOP_SNEAKING, PlayerActionType.StopSneaking]
];

/**
 * The actions `Player Block Actions` may carry.
 *
 * Block actions the server handles from `PlayerAuthInput`. The client can send a creative
 * break here as well as in its standalone `PlayerActionPacket`.
 */
const BLOCK_ACTIONS: ReadonlySet<number> = new Set([
    PlayerActionType.StartDestroyBlock,
    PlayerActionType.AbortDestroyBlock,
    PlayerActionType.StopDestroyBlock,
    PlayerActionType.CrackBlock,
    PlayerActionType.PredictDestroyBlock,
    PlayerActionType.ContinueDestroyBlock,
    PlayerActionType.CreativeDestroyBlock
]);

/** Where an action that concerns no block says it happened. */
const NOWHERE = new BlockPosition(0, 0, 0);

const isFiniteVector = (vector: Vector3): boolean =>
    Number.isFinite(vector.getX()) && Number.isFinite(vector.getY()) && Number.isFinite(vector.getZ());

/**
 * Why a packet cannot be acted on, or null when every value is one a client can send.
 *
 * The reader stores what is on the wire; this is where the values are held against the docs:
 * every flag an existing `PlayerAuthInputData` member, the three modes below their `Count`,
 * the position and rotation finite numbers (a NaN position would become the player's
 * position), and every block action one of the six the field may carry. A reason is returned
 * rather than thrown because a thrown error reaches the log at error level for each packet,
 * and a client sends twenty of these a second.
 */
export const rejectionReason = (packet: PlayerAuthInputPacket): string | null => {
    for (const flag of packet.inputData) {
        if (!(flag in PlayerAuthInputData)) return `input flag ${flag} does not exist`;
    }

    if (packet.inputMode >= InputMode.Count) return `input mode ${packet.inputMode} is out of range`;
    if (packet.playMode >= ClientPlayMode.NumModes) return `play mode ${packet.playMode} is out of range`;
    if (packet.interactionModel < 0 || packet.interactionModel >= NewInteractionModel.Count) {
        return `interaction model ${packet.interactionModel} is out of range`;
    }

    if (!isFiniteVector(packet.position)) return 'the position is not finite';
    if (![packet.pitch, packet.yaw, packet.headYaw].every(Number.isFinite)) return 'the rotation is not finite';

    for (const { action } of packet.blockActions ?? []) {
        if (!BLOCK_ACTIONS.has(action)) return `block action ${action} is not one the input may carry`;
    }

    return null;
};

/**
 * Where the player is and what they pressed, every tick.
 *
 * The one packet a real client moves with, and since movement is not simulated here, the
 * server's whole knowledge of where a player is. It carries three more things when the tick
 * had them (block actions, an item use, an inventory request), and each of those has a
 * handler of its own already, written for the packet the same thing arrives in on its own.
 * Nothing is handled twice: the actions go to `PlayerActionHandler`, the transaction to
 * `InventoryTransactionHandler` and the request to `ItemStackRequestHandler`, each wrapped
 * in the packet that handler expects.
 *
 * Each of those sections is acted on only when its `Input Data` flag is set as well as its
 * presence byte, as the docs describe them: `PerformItemInteraction`,
 * `PerformItemStackRequest` and `PerformBlockActions`. A section without its flag is logged
 * at debug level and skipped.
 *
 * A packet with a value no client can send is dropped whole, at debug level, before anything
 * is done with it. See {@link rejectionReason}.
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

        const reason = rejectionReason(packet);
        if (reason !== null) {
            server
                .getLogger()
                .debug(`Dropped an input from ${player.getName()}: ${reason}`, 'PlayerAuthInputHandler/handle');
            return;
        }

        // Before anything else, so every packet sent about this player from here on carries
        // the tick as its `PlayerInputTick`, whatever else this input turns out to do.
        session.recordInputTick(packet.tick);

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

        if (
            packet.blockActions !== null &&
            this.flagged(packet, PlayerAuthInputData.PERFORM_BLOCK_ACTIONS, 'Player Block Actions', server, session)
        ) {
            for (const { action, position, face } of packet.blockActions) {
                await this.actions.handleAction(action, position, face, server, session);
            }
        }

        if (
            packet.itemUseTransaction !== null &&
            this.flagged(packet, PlayerAuthInputData.PERFORM_ITEM_INTERACTION, 'Item Use Transaction', server, session)
        ) {
            const transaction = new InventoryTransactionPacket();
            transaction.legacyRequestId = packet.itemUseTransaction.legacyRequestId;
            transaction.legacySlotChanges = packet.itemUseTransaction.legacySlotChanges;
            transaction.transactionType = TransactionType.USE_ITEM;
            transaction.inventoryActions = packet.itemUseTransaction.actions;
            transaction.transactionData = packet.itemUseTransaction.data;
            await this.transactions.handle(transaction, server, session);
        }

        if (
            packet.itemStackRequest !== null &&
            this.flagged(packet, PlayerAuthInputData.PERFORM_ITEM_STACK_REQUEST, 'Item Stack Request', server, session)
        ) {
            const request = new ItemStackRequestPacket();
            request.requests = [packet.itemStackRequest];
            await this.requests.handle(request, server, session);
        }
    }

    /**
     * Whether a present section also has the flag the docs gate it on. Logs the mismatch at
     * debug level when it does not.
     */
    private flagged(
        packet: PlayerAuthInputPacket,
        flag: PlayerAuthInputData,
        section: string,
        server: Server,
        session: PlayerSession
    ): boolean {
        if (packet.inputData.has(flag)) return true;

        server
            .getLogger()
            .debug(
                `Ignored the ${section} of an input from ${session.getPlayer().getName()}: the ${PlayerAuthInputData[flag]} flag is not set`,
                'PlayerAuthInputHandler/handle'
            );
        return false;
    }
}
