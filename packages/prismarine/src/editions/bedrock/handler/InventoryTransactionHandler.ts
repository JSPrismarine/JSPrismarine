import type { Vector3 } from '@jsprismarine/math';
import { sendContainerSlot } from '../containerSlot';
import { ContainerUiId, Gametype } from '@jsprismarine/minecraft';
import HumanInventory from '../../../inventory/HumanInventory';
import { WindowIds } from '../../../inventory/WindowIds';
import type { Item } from '../../../item/Item';
import type { InteractionRotation } from '../../../item/interaction';
import type InventoryTransactionPacket from '@jsprismarine/protocol/bedrock/packet/InventoryTransactionPacket';
import type {
    ReleaseItemData,
    ServerInventoryTransaction,
    UseItemData,
    UseItemOnEntityData
} from '../InventoryTransactionAdapter';
import { inventoryTransactionFromProtocol } from '../InventoryTransactionAdapter';
import {
    InventorySourceType,
    HandSlot,
    ItemReleaseActionType,
    TransactionType,
    ItemUseActionType,
    ItemUseOnActorActionType
} from '@jsprismarine/protocol';
import type { Intent } from '../../../input/Intent';
import type { InputContext } from '../../../player/context/HandlerContext';
import type { InputLaneHandler } from '../../../player/context/SessionHandler';

/** A block has six faces, and the docs' Face names one of them. */
const FACE_COUNT = 6;

/** Bedrock's `SimulationTick` trigger for input held from a previous tick. */
const SIMULATION_TICK_TRIGGER = 2;

const isFiniteVector = (vector: Vector3): boolean =>
    Number.isFinite(vector.getX()) && Number.isFinite(vector.getY()) && Number.isFinite(vector.getZ());

const isFace = (face: number): boolean => Number.isInteger(face) && face >= 0 && face < FACE_COUNT;

/**
 * Why a transaction cannot be acted on, or null when every value is one a client can send.
 *
 * The packet stores what is on the wire; this is where the values are held against the docs:
 * the type a {@link TransactionType}, every action's source an {@link InventorySourceType}, the
 * body present for a type that has one and absent for one that does not, its action type a
 * member of the enum for that body, the hand a {@link HandSlot}, the hotbar slot inside the
 * hotbar, the face one of a block's six when a block is clicked, and every position finite.
 *
 * A reason is returned rather than thrown because a thrown error reaches the log at error
 * level, and a client that disagrees with the server is ordinary traffic.
 */
export const rejectionReason = (transaction: ServerInventoryTransaction): string | null => {
    const type = transaction.transactionType;
    if (!(type in TransactionType)) return `transaction type ${type} is not one the packet may carry`;

    for (const action of transaction.inventoryActions) {
        if (!(action.sourceType in InventorySourceType)) return `action source ${action.sourceType} does not exist`;
    }

    const data = transaction.transactionData;
    if (type === TransactionType.NORMAL || type === TransactionType.MISMATCH) {
        return data === null ? null : `a ${TransactionType[type]} transaction carries a ${data.kind} body`;
    }

    if (data === null) return `a ${TransactionType[type]} transaction has no body`;
    if (!HumanInventory.isHotbarSlot(data.hotbarSlot)) return `hotbar slot ${data.hotbarSlot} is outside the hotbar`;

    switch (data.kind) {
        case 'useItem':
            if (type !== TransactionType.USE_ITEM)
                return `a ${TransactionType[type]} transaction carries a use-item body`;
            if (!(data.actionType in ItemUseActionType)) return `item use action ${data.actionType} does not exist`;
            if (!(data.hand in HandSlot)) return `hand ${data.hand} does not exist`;
            if (data.actionType === ItemUseActionType.PLACE && !isFace(data.blockFace)) {
                return `face ${data.blockFace} is not one of a block's six`;
            }
            if (!isFiniteVector(data.playerPosition) || !isFiniteVector(data.clickPosition)) {
                return 'a position is not finite';
            }
            return null;

        case 'useItemOnEntity':
            if (type !== TransactionType.USE_ITEM_ON_ENTITY) {
                return `a ${TransactionType[type]} transaction carries a use-item-on-entity body`;
            }
            if (!(data.actionType in ItemUseOnActorActionType)) {
                return `item use on entity action ${data.actionType} does not exist`;
            }
            if (!isFiniteVector(data.playerPosition) || !isFiniteVector(data.clickPosition)) {
                return 'a position is not finite';
            }
            return null;

        case 'releaseItem':
            if (type !== TransactionType.RELEASE_ITEM)
                return `a ${TransactionType[type]} transaction carries a release body`;
            if (!(data.actionType in ItemReleaseActionType))
                return `item release action ${data.actionType} does not exist`;
            if (!isFiniteVector(data.playerPosition)) return 'a position is not finite';
            return null;
    }
};

/**
 * The client's item use, attack and release, decoded into the intents both editions share
 * ([ADR 0027](../../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 *
 * A transaction with a value no client can send is dropped at debug level before anything
 * is done with it. See {@link rejectionReason}. One whose hotbar slot is not the one the
 * server has selected is dropped at verbose level: the client selects a slot through
 * `MobEquipmentPacket` before it uses it, so a disagreement means the two have come apart.
 * What survives becomes an intent, whose handler checks it against the server's own state:
 * the item used is the one the server has in the player's hand, reach is measured from where
 * the server has the player, and an entity is looked up by the runtime id the server assigned.
 *
 * `PlayerAuthInputHandler` hands the item use carried inside an input to this same handler,
 * wrapped in the packet it would have arrived in on its own.
 */
export default class InventoryTransactionHandler implements InputLaneHandler<InventoryTransactionPacket> {
    public static PacketName = 'InventoryTransactionPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /**
     * Handles an inventory transaction.
     *
     * Synchronous, as the input step needs.
     * @param packet - The transaction to apply.
     * @param context - The player's network session, and the input step that applies it.
     * @param interactionRotation - The view rotation from PlayerAuthInput when present.
     */
    public handle(
        packet: InventoryTransactionPacket,
        context: InputContext,
        interactionRotation?: InteractionRotation
    ): undefined {
        const { session: connection, log } = context;
        if (!connection.isConnected()) return;
        const player = connection.getPlayer();
        if (player.gamemode === Gametype.SPECTATOR) return; // Spectators pass through the world without touching it.

        const packetData = packet.getPacketData();
        if (packetData === null) return;
        const transaction = inventoryTransactionFromProtocol(packetData, connection.getConnection().codec.context);

        const reason = rejectionReason(transaction);
        if (reason !== null) {
            log.debug(`Dropped an inventory transaction from ${connection.identity.name}: ${reason}`);
            return;
        }

        const data = transaction.transactionData;
        if (data === null) {
            // The client's idea of an inventory did not match what it was sent. Nothing here
            // can be applied, but a client saying so is ordinary traffic, not a fault, and it
            // used to be thrown on.
            if (transaction.transactionType === TransactionType.MISMATCH) {
                log.verbose(`${connection.identity.name} reported an inventory mismatch`);
            } else {
                this.handleNormal(transaction, context);
            }
            return;
        }

        const handSlot = player.getInventory().getHandSlot();
        if (data.hotbarSlot !== handSlot) {
            log.verbose(
                `Dropped an inventory transaction from ${connection.identity.name}: it names hotbar slot ${data.hotbarSlot} and the server has ${handSlot} selected`
            );
            return;
        }

        const intent = this.intentOf(data, context, interactionRotation);
        if (intent === undefined) return;
        const handled = context.services.intents.handle(intent, context);
        if (handled instanceof Promise) context.step.output(handled);
    }

    /** The intent a transaction's body decodes into, or undefined for one that asks for nothing. */
    private intentOf(
        data: UseItemData | UseItemOnEntityData | ReleaseItemData,
        context: InputContext,
        interactionRotation: InteractionRotation | undefined
    ): Intent | undefined {
        switch (data.kind) {
            case 'useItem':
                return this.useItemIntentOf(data, context, interactionRotation);

            // The item in hand used on an entity, which is how a melee attack arrives: not
            // through `InteractPacket`, which is what its name suggests. `InteractPacket` carries
            // mounting, dismounting and opening a villager's trades, and a swing comes here. An
            // interaction and a targeted item use, a spawn egg's, both go to the content.
            case 'useItemOnEntity':
                switch (data.actionType) {
                    case ItemUseOnActorActionType.ATTACK:
                        return { kind: 'attackEntity', target: data.entityRuntimeId };
                    case ItemUseOnActorActionType.INTERACT:
                    case ItemUseOnActorActionType.ITEM_INTERACT:
                        return { kind: 'interactEntity', target: data.entityRuntimeId };
                    default:
                        return undefined;
                }

            // The docs' Use action, a crossbow finishing its charge, ends the use and does
            // nothing more, since crossbows are not implemented.
            case 'releaseItem':
                return {
                    kind: 'releaseItem',
                    action: data.actionType === ItemReleaseActionType.RELEASE ? 'release' : 'consume'
                };
        }
    }

    /**
     * The intent of the item in hand being used: on a block, on nothing, or to break a block.
     * What is placed is the item the server has in the player's hand, which the intent's handler
     * reads for itself, not the Item the client sent: the client's copy says what it believes it
     * holds, and the server's inventory is the one that decides.
     */
    private useItemIntentOf(
        data: UseItemData,
        { session, log, config }: InputContext,
        interactionRotation: InteractionRotation | undefined
    ): Intent | undefined {
        const { blockPosition } = data;
        const position = { x: blockPosition.getX(), y: blockPosition.getY(), z: blockPosition.getZ() };
        switch (data.actionType) {
            case ItemUseActionType.PLACE:
                return {
                    kind: 'useItemOnBlock',
                    position,
                    face: data.blockFace,
                    faceLocation: {
                        x: data.clickPosition.getX(),
                        y: data.clickPosition.getY(),
                        z: data.clickPosition.getZ()
                    },
                    ...(interactionRotation === undefined ? {} : { rotation: interactionRotation })
                };

            // Survival's route into a break when the client times it. With
            // server-authoritative block breaking the client reports the break as
            // `PREDICT_DESTROY_BLOCK` instead, and a transaction saying a block broke is one
            // that skipped the mining the server is timing. Creative announces the same thing
            // through PlayerAction, and both end up in `breakBlock`, which does nothing the
            // second time round.
            case ItemUseActionType.DESTROY:
                if (config.getServerAuthoritativeBlockBreaking()) {
                    log.verbose(
                        `Dropped a block break transaction from ${session.identity.name}: block breaking is server-authoritative`
                    );
                    return undefined;
                }
                return {
                    kind: 'mineBlock',
                    step: 'finish',
                    position,
                    face: data.blockFace,
                    serverTimed: false,
                    breaksIfInstant: false
                };

            case ItemUseActionType.USE:
                return { kind: 'useItem', held: data.triggerType === SIMULATION_TICK_TRIGGER };

            // A swing at nothing. Hitting an entity arrives as `USE_ITEM_ON_ENTITY` instead,
            // so there is nothing here to apply.
            case ItemUseActionType.USE_AS_ATTACK:
                return undefined;
        }
    }

    /**
     * A legacy client's Normal transaction. Inventory moves stay server-authoritative; the
     * one world interaction handled here is the two-action drop that removes a stack from
     * player inventory and creates its matching world item.
     */
    private handleNormal(transaction: ServerInventoryTransaction, { session, log, step }: InputContext): void {
        const player = session.getPlayer();
        if (transaction.transactionType === TransactionType.NORMAL && transaction.inventoryActions.length === 2) {
            const container = transaction.inventoryActions.find(
                (action) => action.sourceType === InventorySourceType.CONTAINER
            );
            const world = transaction.inventoryActions.find(
                (action) => action.sourceType === InventorySourceType.WORLD
            );

            if (
                container !== undefined &&
                world !== undefined &&
                container.windowId === WindowIds.INVENTORY &&
                container.sourceFlags === null &&
                Number.isInteger(container.targetSlot) &&
                container.targetSlot >= 0 &&
                container.targetSlot < player.getInventory().container('inventory').size &&
                world.windowId === null &&
                world.sourceFlags === 0 &&
                world.targetSlot === 0 &&
                this.isAir(world.oldItem)
            ) {
                const inventory = player.getInventory().container('inventory');
                const held = inventory.get(container.targetSlot);
                const oldCount = container.oldItem.getAmount();
                const remainingCount = this.isAir(container.newItem) ? 0 : container.newItem.getAmount();
                const droppedCount = world.newItem.getAmount();
                const sameStack = (left: Item, right: Item): boolean =>
                    left.getName() === right.getName() &&
                    left.meta === right.meta &&
                    left.getBlockRuntimeId() === right.getBlockRuntimeId();

                if (
                    held !== null &&
                    sameStack(container.oldItem, held) &&
                    oldCount === held.getAmount() &&
                    droppedCount > 0 &&
                    droppedCount + remainingCount === oldCount &&
                    sameStack(world.newItem, held) &&
                    (remainingCount === 0 ||
                        (sameStack(container.newItem, held) && container.newItem.getAmount() === remainingCount))
                ) {
                    inventory.set(container.targetSlot, held.withCount(remainingCount));

                    const dropped = held.withCount(droppedCount);
                    dropped.stackNetworkId = 0;
                    step.output(
                        sendContainerSlot(
                            session.getConnection(),
                            WindowIds.INVENTORY,
                            ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY,
                            container.targetSlot,
                            inventory.get(container.targetSlot)
                        )
                    );
                    // The stack enters the world before the drop first waits.
                    step.output(session.getWorld().dropFromPlayer(player, [dropped], session.runtimeId));
                    return;
                }
            }
        }

        const sources = transaction.inventoryActions.map((action) => InventorySourceType[action.sourceType]).join(', ');
        log.debug(
            `Ignored a Normal inventory transaction from ${session.identity.name} with ${transaction.inventoryActions.length} actions (${sources}); item moves go through ItemStackRequest`
        );
    }

    /** Whether an action names the empty stack used for an absent inventory item. */
    private isAir(item: Item): boolean {
        return item.getName() === 'minecraft:air' || item.getAmount() <= 0;
    }
}
