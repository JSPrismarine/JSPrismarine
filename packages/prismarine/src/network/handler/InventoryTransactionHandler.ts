import type { Vector3 } from '@jsprismarine/math';
import { ContainerUiId, Gametype } from '@jsprismarine/minecraft';
import type { PlayerSession } from '../../';
import { EXHAUSTION } from '../../entity/playerHunger';
import { BOW, loose } from '../../entity/Archery';
import { CREATIVE_REACH, meleeAttack, SURVIVAL_REACH } from '../../entity/Combat';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { WindowIds } from '../../inventory/WindowIds';
import type { Item } from '../../item/Item';
import { consumeTicksOf, useItemInAir, useItemOnBlock, useItemOnEntity } from '../../item/interaction';
import type { InteractingPlayer, InteractionResult, InteractionRotation } from '../../item/interaction';
import type InventoryTransactionPacket from '@jsprismarine/protocol/packet/InventoryTransactionPacket';
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
import { MAX_BLOCK_TARGET_DISTANCE } from './BlockTarget';
import { EyeOfEnderEcho } from './eyeOfEnderEcho';
import type { HandlerLog, HandlerServices, InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * What sprinting is worth in knockback levels.
 *
 * One, the same as a level of the Knockback enchantment, which is why a sprint-hit sends
 * somebody flying and a standing one nudges them.
 */
const SPRINT_KNOCKBACK = 1;

/** A block has six faces, and the docs' Face names one of them. */
const FACE_COUNT = 6;

/** Bedrock's `SimulationTick` trigger for input held from a previous tick. */
const SIMULATION_TICK_TRIGGER = 2;

/** The item whose block interaction also has a separate air-use behavior. */
const ENDER_EYE = 'minecraft:ender_eye';

/**
 * How many ticks after an eye of ender was used on a block the same client's click at nothing
 * is still taken for that click's echo.
 *
 * The client reports one right click on an end portal frame as a block use and as a use in the
 * air, in either tick. The frame takes the eye, so the second report must not throw it.
 */
const EYE_ECHO_TICKS = 2;

/** The eye of ender block uses whose air-use echo is still due. */
const eyeEcho = new EyeOfEnderEcho(EYE_ECHO_TICKS);

/** What the content hooks are offered a click through: the content, its actors and the log. */
interface ContentHooks {
    readonly services: Pick<HandlerServices, 'content' | 'contentWorld'>;
    readonly log: HandlerLog;
}

/**
 * One right click on a block, offered to the content hooks.
 *
 * @returns Whether a behavior family or a placement consumed the click. A behavior that throws
 *   is logged and declines.
 */
const contentUse = (
    { services, log }: ContentHooks,
    player: InteractingPlayer,
    data: UseItemData,
    rotation?: InteractionRotation
): InteractionResult => {
    const { content } = services;
    const actors = services.contentWorld.actorsAt(player.getWorld().getDimension().name);

    try {
        return useItemOnBlock({
            content,
            actors,
            player,
            position: {
                x: data.blockPosition.getX(),
                y: data.blockPosition.getY(),
                z: data.blockPosition.getZ()
            },
            face: data.blockFace,
            faceLocation: {
                x: data.clickPosition.getX(),
                y: data.clickPosition.getY(),
                z: data.clickPosition.getZ()
            },
            ...(rotation === undefined ? {} : { rotation })
        });
    } catch (error: unknown) {
        // A behavior that throws must not take the packet handler down with it, and it must
        // not go unreported either. The throw reaches the log and the click goes unanswered.
        log.error(error);
        return 'declined';
    }
};

/**
 * One right click on an entity, offered to the content hooks.
 *
 * @returns Whether a behavior consumed the click. Nothing follows it either way: this server has
 *   no legacy path for using an item on an entity.
 */
const contentUseOnEntity = (
    { services, log }: ContentHooks,
    player: InteractingPlayer,
    data: UseItemOnEntityData
): InteractionResult => {
    const { content } = services;
    const actors = services.contentWorld.actorsAt(player.getWorld().getDimension().name);

    const target = player.getWorld().getActor(data.entityRuntimeId);
    if (target === null) return 'declined';
    const position = target.getPosition();

    try {
        return useItemOnEntity({
            content,
            actors,
            player,
            target: {
                identifier: target.getType(),
                runtimeId: Number(target.getRuntimeId()),
                position: { x: position.getX(), y: position.getY(), z: position.getZ() }
            }
        });
    } catch (error: unknown) {
        log.error(error);
        return 'declined';
    }
};

/**
 * One right click on nothing, offered to the item in hand.
 *
 * @returns Whether a behavior consumed the click. A behavior that throws is logged and declines.
 */
const contentUseInAir = ({ services, log }: ContentHooks, player: InteractingPlayer): InteractionResult => {
    const { content } = services;
    const actors = services.contentWorld.actorsAt(player.getWorld().getDimension().name);

    try {
        return useItemInAir({ content, actors, player });
    } catch (error: unknown) {
        log.error(error);
        return 'declined';
    }
};

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
 * The client's item use, attack and release, acted on against the server's own state.
 *
 * The server's inventory, position and entity list decide what happens. The transaction says
 * which slot, item and position the client believes in, and those are checked against the
 * server's copy rather than trusted: the item placed or swung is the one the server has in
 * the player's hand, the reach is measured from where the server has the player, and the
 * entity hit is looked up by the runtime id the server assigned.
 *
 * A transaction with a value no client can send is dropped at debug level before anything
 * is done with it. See {@link rejectionReason}. One whose hotbar slot is not the one the
 * server has selected is dropped at verbose level: the client selects a slot through
 * `MobEquipmentPacket` before it uses it, so a disagreement means the two have come apart.
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
     * Synchronous, as the input step needs. A break with client-timed breaking still waits on
     * the world before it finishes writing, so it goes to `step.defer`, beside the slice that
     * removes the wait.
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
            log.debug(
                `Dropped an inventory transaction from ${connection.identity.name}: ${reason}`,
                'InventoryTransactionHandler/handle'
            );
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

        const handSlot = player.getInventory().getHandSlotIndex();
        if (data.hotbarSlot !== handSlot) {
            log.verbose(
                `Dropped an inventory transaction from ${connection.identity.name}: it names hotbar slot ${data.hotbarSlot} and the server has ${handSlot} selected`,
                'InventoryTransactionHandler/handle'
            );
            return;
        }

        switch (data.kind) {
            case 'useItem':
                this.handleUseItem(data, context, interactionRotation);
                return;
            case 'useItemOnEntity':
                this.handleUseItemOnEntity(data, context);
                return;
            case 'releaseItem':
                this.handleReleaseItem(data, context);
                return;
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
                container.targetSlot < player.getInventory().getSlotCount() &&
                world.windowId === null &&
                world.sourceFlags === 0 &&
                world.targetSlot === 0 &&
                this.isAir(world.oldItem)
            ) {
                const inventory = player.getInventory();
                const held = inventory.getItem(container.targetSlot);
                const oldCount = container.oldItem.getAmount();
                const remainingCount = this.isAir(container.newItem) ? 0 : container.newItem.getAmount();
                const droppedCount = world.newItem.getAmount();
                const sameStack = (left: Item, right: Item): boolean =>
                    left.getName() === right.getName() &&
                    left.meta === right.meta &&
                    left.getBlockRuntimeId() === right.getBlockRuntimeId();

                if (
                    !this.isAir(held) &&
                    sameStack(container.oldItem, held) &&
                    oldCount === held.getAmount() &&
                    droppedCount > 0 &&
                    droppedCount + remainingCount === oldCount &&
                    sameStack(world.newItem, held) &&
                    (remainingCount === 0 ||
                        (sameStack(container.newItem, held) && container.newItem.getAmount() === remainingCount))
                ) {
                    if (remainingCount === 0) inventory.removeItem(container.targetSlot);
                    else
                        inventory.setItem(
                            container.targetSlot,
                            new ContainerEntry({ item: held.withCount(remainingCount), count: remainingCount })
                        );

                    const dropped = held.withCount(droppedCount);
                    dropped.stackNetworkId = 0;
                    step.output(
                        session.sendContainerSlot(
                            WindowIds.INVENTORY,
                            ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY,
                            container.targetSlot,
                            inventory.getItem(container.targetSlot)
                        )
                    );
                    // The stack enters the world before the drop first waits.
                    step.output(session.getWorld().dropFromPlayer(player, [dropped]));
                    return;
                }
            }
        }

        const sources = transaction.inventoryActions.map((action) => InventorySourceType[action.sourceType]).join(', ');
        log.debug(
            `Ignored a Normal inventory transaction from ${session.identity.name} with ${transaction.inventoryActions.length} actions (${sources}); item moves go through ItemStackRequest`,
            'InventoryTransactionHandler/handleNormal'
        );
    }

    /** Whether an action names the empty stack used for an absent inventory item. */
    private isAir(item: Item): boolean {
        return item.getName() === 'minecraft:air' || item.getAmount() <= 0;
    }

    /**
     * The item in hand being used *on an entity*, which is how a melee attack arrives.
     *
     * Not through `InteractPacket`, which is what its name suggests and which is why this sat
     * unimplemented for so long: `InteractPacket` carries mounting, dismounting and opening a
     * villager's trades, and a swing comes through here instead.
     *
     * The target is looked up by runtime id in the world's own map. A runtime id the world
     * does not track is ordinary traffic, since a client can swing at something the server
     * removed in the same tick, and it is logged at verbose level and dropped. The reach is
     * measured by `meleeAttack` from the server's position for the player, not from the
     * From Position the client sent.
     */
    private handleUseItemOnEntity(data: UseItemOnEntityData, context: InputContext): void {
        const { session, log } = context;
        if (
            data.actionType === ItemUseOnActorActionType.INTERACT ||
            data.actionType === ItemUseOnActorActionType.ITEM_INTERACT
        ) {
            // Entity interactions and targeted item uses both enter the content path. The latter
            // includes spawn eggs; the item's `onUse` reads the clicked entity through `targetOf`.
            // The content rules take the session, which answers for the player and its client.
            contentUseOnEntity(context, session, data);
            return;
        }

        if (data.actionType !== ItemUseOnActorActionType.ATTACK) return;

        const target = session.getWorld().getActor(data.entityRuntimeId);
        if (!target) {
            log.verbose(
                `${session.identity.name} swung at runtime id ${data.entityRuntimeId}, which is not an entity here`,
                'InventoryTransactionHandler/handleUseItemOnEntity'
            );
            return;
        }

        // A player whose entity is in no store yet cannot reach anything.
        const attacker = session.getActor();
        if (attacker === undefined) return;
        const player = session.getPlayer();
        const components = player.getComponents();
        // In this input's unit: the blow, its sounds and the hunger it costs are all written
        // before `meleeAttack` returns, so a throw anywhere undoes the swing whole.
        const landed = meleeAttack(attacker, target, {
            reach: player.gamemode === Gametype.CREATIVE ? CREATIVE_REACH : SURVIVAL_REACH,

            // What they are holding, not their attack attribute: in vanilla the weapon *is*
            // the number, and an empty hand is one point rather than none.
            damage: player.getInventory().getItemInHand().getAttackDamage(),

            // Falling, and actually descending: a player on the way up through a jump is off
            // the ground too, and vanilla does not let them crit from there.
            critical: !player.isOnGround() && components.get('vitals.fallDistance') > 0 && !player.isFlying(),

            knockbackLevels: components.get('movement.sprinting') ? SPRINT_KNOCKBACK : 0
        });

        // Only a swing that connected costs anything. A miss is free, which is why the hunger
        // is charged here rather than before the attempt.
        if (landed) session.inputs().exhaustPlayer(player, EXHAUSTION.attacking);
    }

    /**
     * Starts the clock on eating or drinking the item in hand, if it is a consumable.
     *
     * The client reports the start of a meal and nothing at its end, so the player finishes it
     * itself once the item's `consume_seconds` have passed.
     */
    private startMeal({ services }: Pick<InputContext, 'services'>, session: PlayerSession): void {
        const player = session.getPlayer();
        const ticks = consumeTicksOf(services.content, player);
        if (ticks === undefined) return;

        session.inputs().beginPlayerMeal(player, ticks);
    }

    /**
     * A held item let go of, which for a bow means the arrow leaves.
     *
     * The charge is measured rather than sent; see the `USE` branch of
     * {@link handleUseItem} for why. The docs' Use action, a crossbow finishing its charge, is
     * taken and does nothing, since crossbows are not implemented.
     *
     * The arrow is not taken out of the inventory and the bow is not worn down. Both need the
     * same thing, telling the client that a slot has changed, and both are left with the armor
     * work where that lives, because a server that silently disagrees with the client about
     * what is in a player's hand is worse than one that has not got round to the accounting.
     */
    private handleReleaseItem(data: ReleaseItemData, { session, step }: InputContext): void {
        const player = session.getPlayer();
        // Letting go of the button ends a meal that has not finished.
        session.inputs().cancelPlayerMeal(player);
        // The draw's clock, which the store player keeps.
        const drawn = player.takeItemUseTicks(step.tick);

        if (data.actionType !== ItemReleaseActionType.RELEASE) return;
        if (player.getInventory().getItemInHand().getName() !== BOW) return;

        // The arrow and the bow's sound are written in this input's unit.
        const shooter = session.getActor();
        if (shooter !== undefined) loose(shooter, drawn);
    }

    /**
     * The item in hand being used: on a block, on nothing, or to break a block.
     *
     * The block the client names has to be within {@link MAX_BLOCK_TARGET_DISTANCE} of where the
     * server has the player, or the transaction is dropped at verbose level. What is placed is
     * the item the server has in the player's hand, which `useItemOnBlock` reads for itself,
     * not the Item the client sent: the client's copy says what it believes it holds, and the
     * server's inventory is the one that decides.
     */
    private handleUseItem(data: UseItemData, context: InputContext, interactionRotation?: InteractionRotation): void {
        const { session, log, config, step } = context;
        // The content rules take the session, and the block break the store player.
        const player = session.getPlayer();
        switch (data.actionType) {
            case ItemUseActionType.PLACE:
            case ItemUseActionType.DESTROY: {
                const distance = player.getPosition().distanceTo(data.blockPosition);
                if (!Number.isFinite(distance) || distance > MAX_BLOCK_TARGET_DISTANCE) {
                    log.verbose(
                        `Dropped item use ${ItemUseActionType[data.actionType]} from ${session.identity.name} on a block ${distance.toFixed(1)} away`,
                        'InventoryTransactionHandler/handleUseItem'
                    );
                    return;
                }

                if (data.actionType === ItemUseActionType.PLACE) {
                    // The block's and the item's behavior families get the click, and the block
                    // in hand goes down when neither takes it. What a click they all decline
                    // gets is nothing: the item places no block, so the client predicted none.
                    if (player.getInventory().getItemInHand().getName() === ENDER_EYE) {
                        eyeEcho.usedOnBlock(session.runtimeId, step.tick);
                    }
                    contentUse(context, session, data, interactionRotation);
                    return;
                }

                // Survival's route into a break when the client times it. With
                // server-authoritative block breaking the client reports the break as
                // `PREDICT_DESTROY_BLOCK` instead, and a transaction saying a block broke is one
                // that skipped the mining the server is timing. Creative announces the same
                // thing through PlayerAction, and both end up in `breakBlock`, which does
                // nothing the second time round.
                if (config.getServerAuthoritativeBlockBreaking()) {
                    log.verbose(
                        `Dropped a block break transaction from ${session.identity.name}: block breaking is server-authoritative`,
                        'InventoryTransactionHandler/handleUseItem'
                    );
                    return;
                }

                // Only in a chunk the world already holds, as ADR 0014 has an input do.
                const world = session.getWorld();
                const { blockPosition } = data;
                if (world.getLoadedChunk(blockPosition.getX() >> 4, blockPosition.getZ() >> 4) === null) {
                    log.verbose(
                        `Dropped a block break transaction from ${session.identity.name} in a chunk that is not loaded`,
                        'InventoryTransactionHandler/handleUseItem'
                    );
                    return;
                }

                // Deferred until slice 9: a break writes through `setBlockByName`, which may still
                // load a chunk, and drops what the block yields after it.
                step.defer(async () => void (await world.breakBlock(blockPosition, session.getPlayer())));
                return;
            }

            case ItemUseActionType.USE:
                // A held input is not a new Eye of Ender click, and neither is the air-use report of
                // a click that was just used on a block. In particular, after the frame hook fills
                // a frame, neither a simulation tick nor the click's own echo may throw the eye.
                if (player.getInventory().getItemInHand().getName() === ENDER_EYE) {
                    const echo = eyeEcho.isEcho(session.runtimeId, step.tick);
                    if (data.triggerType === SIMULATION_TICK_TRIGGER || echo) return;
                }

                // Bedrock never says how long a bow was drawn for. It says "started" here and
                // "released" in another transaction entirely, and the gap between the two is the
                // charge. So the clock starts here.
                if (player.getInventory().getItemInHand().getName() === BOW) {
                    session.getPlayer().beginItemUse(step.tick);
                }

                // The item's own `onUse`, which is how an eye of ender or a snowball leaves the
                // hand. Eating is not here: it ends in a release the content has no path for yet.
                if (contentUseInAir(context, session) === 'handled') this.startMeal(context, session);
                return;

            // A swing at nothing. Hitting an entity arrives as `USE_ITEM_ON_ENTITY` instead,
            // so there is nothing here to apply.
            case ItemUseActionType.USE_AS_ATTACK:
                return;
        }
    }
}
