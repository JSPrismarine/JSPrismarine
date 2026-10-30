import type { Vector3 } from '@jsprismarine/math';
import {
    ClientPlayMode,
    HandSlot,
    InputMode,
    NewInteractionModel,
    PlayerActionType,
    PlayerAuthInputData,
    TransactionType
} from '@jsprismarine/protocol';
import InventoryTransactionPacket from '@jsprismarine/protocol/packet/InventoryTransactionPacket';
import type PlayerAuthInputPacket from '@jsprismarine/protocol/packet/PlayerAuthInputPacket';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import BlockPosition from '../../world/BlockPosition';
import { inventoryTransactionToProtocol } from '../InventoryTransactionAdapter';
import { playerAuthInputFromProtocol } from '../PlayerAuthInputAdapter';
import ItemStackRequestPacket from '@jsprismarine/protocol/packet/ItemStackRequestPacket';
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
export const rejectionReason = (input: ReturnType<typeof playerAuthInputFromProtocol>): string | null => {
    for (const flag of input.inputData) {
        if (!(flag in PlayerAuthInputData)) return `input flag ${flag} does not exist`;
    }

    if (input.inputMode >= InputMode.Count) return `input mode ${input.inputMode} is out of range`;
    if (input.playMode >= ClientPlayMode.NumModes) return `play mode ${input.playMode} is out of range`;
    if (input.interactionModel < 0 || input.interactionModel >= NewInteractionModel.Count) {
        return `interaction model ${input.interactionModel} is out of range`;
    }

    if (!isFiniteVector(input.position)) return 'the position is not finite';
    if (![input.pitch, input.yaw, input.headYaw].every(Number.isFinite)) return 'the rotation is not finite';
    if (
        input.itemUseTransaction !== null &&
        input.inputData.has(PlayerAuthInputData.PERFORM_ITEM_INTERACTION) &&
        ![input.interactRotation.x, input.interactRotation.y].every(Number.isFinite)
    ) {
        return 'the interaction rotation is not finite';
    }

    for (const { action } of input.blockActions ?? []) {
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
    public static PacketName = 'PlayerAuthInputPacket';
    public readonly phases = ['play'] as const;

    private readonly actions = new PlayerActionHandler();
    private readonly transactions = new InventoryTransactionHandler();
    private readonly requests = new ItemStackRequestHandler();

    public async handle(packet: PlayerAuthInputPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const packetData = packet.getPacketData();
        if (packetData === null) return;
        const input = playerAuthInputFromProtocol(packetData, session.getConnection().codec.context);

        const reason = rejectionReason(input);
        if (reason !== null) {
            server
                .getLogger()
                .debug(`Dropped an input from ${player.getName()}: ${reason}`, 'PlayerAuthInputHandler/handle');
            return;
        }

        // Before anything else, so every packet sent about this player from here on carries
        // the tick as its `PlayerInputTick`, whatever else this input turns out to do.
        session.recordInputTick(input.tick);

        if (!player.isOnline()) return;

        await applyClientMovement(server, session, {
            position: input.position,
            pitch: input.pitch,
            yaw: input.yaw,
            headYaw: input.headYaw,
            // The input has no "on ground" bit. A vertical collision is the nearest thing it
            // says: the ground pushing back, every tick the player stands on it.
            onGround: input.inputData.has(PlayerAuthInputData.VERTICAL_COLLISION)
        });

        for (const [flag, action] of FLAG_ACTIONS) {
            if (input.inputData.has(flag)) await this.actions.handleAction(action, NOWHERE, 0, server, session);
        }

        if (
            input.blockActions !== null &&
            this.flagged(input, PlayerAuthInputData.PERFORM_BLOCK_ACTIONS, 'Player Block Actions', server, session)
        ) {
            for (const { action, position, face } of input.blockActions) {
                await this.actions.handleAction(action, position, face, server, session);
            }
        }

        if (
            input.itemUseTransaction !== null &&
            this.flagged(input, PlayerAuthInputData.PERFORM_ITEM_INTERACTION, 'Item Use Transaction', server, session)
        ) {
            const transaction = new InventoryTransactionPacket(
                inventoryTransactionToProtocol(
                    {
                        legacyRequest: {
                            legacyRequestId: input.itemUseTransaction.legacyRequestId,
                            legacySlotChanges: input.itemUseTransaction.legacySlotChanges
                        },
                        transactionType: TransactionType.USE_ITEM,
                        inventoryActions: input.itemUseTransaction.actions,
                        transactionData: input.itemUseTransaction.data,
                        hand: HandSlot.MAINHAND
                    },
                    session.getConnection().codec.context
                )
            );
            await this.transactions.handle(transaction, server, session, {
                pitch: input.interactRotation.x,
                yaw: input.interactRotation.y
            });
        }

        if (
            input.itemStackRequest !== null &&
            this.flagged(input, PlayerAuthInputData.PERFORM_ITEM_STACK_REQUEST, 'Item Stack Request', server, session)
        ) {
            const request = new ItemStackRequestPacket();
            request.requests = [input.itemStackRequest];
            await this.requests.handle(request, server, session);
        }
    }

    /**
     * Whether a present section also has the flag the docs gate it on. Logs the mismatch at
     * debug level when it does not.
     */
    private flagged(
        input: ReturnType<typeof playerAuthInputFromProtocol>,
        flag: PlayerAuthInputData,
        section: string,
        server: Server,
        session: PlayerSession
    ): boolean {
        if (input.inputData.has(flag)) return true;

        server
            .getLogger()
            .debug(
                `Ignored the ${section} of an input from ${session.getPlayer().getName()}: the ${PlayerAuthInputData[flag]} flag is not set`,
                'PlayerAuthInputHandler/handle'
            );
        return false;
    }
}
