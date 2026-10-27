import type { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import type { PlayerSession } from '../../';
import type Player from '../../Player';
import { EXHAUSTION } from '../../Player';
import type Server from '../../Server';
import { BOW, loose } from '../../entity/Archery';
import { CREATIVE_REACH, meleeAttack, SURVIVAL_REACH } from '../../entity/Combat';
import HumanInventory from '../../inventory/HumanInventory';
import { useItemOnBlock, useItemOnEntity } from '../../item/interaction';
import type { InteractionResult } from '../../item/interaction';
import Identifiers from '../Identifiers';
import type { InventoryTransactionPacket } from '../Packets';
import type { ReleaseItemData, UseItemData, UseItemOnEntityData } from '../packet/InventoryTransactionPacket';
import {
    InventorySourceType,
    HandSlot,
    ItemReleaseActionType,
    TransactionType,
    ItemUseActionType,
    ItemUseOnActorActionType
} from '../packet/InventoryTransactionPacket';
import { MAX_BLOCK_TARGET_DISTANCE } from './BlockTarget';
import type PacketHandler from './PacketHandler';

/**
 * What sprinting is worth in knockback levels.
 *
 * One, the same as a level of the Knockback enchantment, which is why a sprint-hit sends
 * somebody flying and a standing one nudges them.
 */
const SPRINT_KNOCKBACK = 1;

/** A block has six faces, and the docs' Face names one of them. */
const FACE_COUNT = 6;

/**
 * One right click on a block, offered to the content hooks.
 *
 * @returns Whether a behavior family or a placement consumed the click. A behavior that throws
 *   is logged and declines.
 */
const contentUse = (server: Server, player: Player, data: UseItemData): InteractionResult => {
    const content = server.getContent();
    const actors = server.getContentWorld().actorsAt(player.getWorld().getDimension().name);

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
            }
        });
    } catch (error: unknown) {
        // A behavior that throws must not take the packet handler down with it, and it must
        // not go unreported either. The throw reaches the log and the click goes unanswered.
        server.getLogger().error(error);
        return 'declined';
    }
};

/**
 * One right click on an entity, offered to the content hooks.
 *
 * @returns Whether a behavior consumed the click. Nothing follows it either way: this server has
 *   no legacy path for using an item on an entity.
 */
const contentUseOnEntity = (server: Server, player: Player, data: UseItemOnEntityData): InteractionResult => {
    const content = server.getContent();
    const actors = server.getContentWorld().actorsAt(player.getWorld().getDimension().name);

    const target = player.getWorld().getEntity(data.entityRuntimeId);
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
        server.getLogger().error(error);
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
export const rejectionReason = (packet: InventoryTransactionPacket): string | null => {
    const type = packet.transactionType;
    if (!(type in TransactionType)) return `transaction type ${type} is not one the packet may carry`;

    for (const action of packet.inventoryActions) {
        if (!(action.sourceType in InventorySourceType)) return `action source ${action.sourceType} does not exist`;
    }

    const data = packet.transactionData;
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
export default class InventoryTransactionHandler implements PacketHandler<InventoryTransactionPacket> {
    public static NetID = Identifiers.InventoryTransactionPacket;

    public async handle(packet: InventoryTransactionPacket, server: Server, connection: PlayerSession): Promise<void> {
        const player = connection.getPlayer();
        if (!player.isOnline()) return;
        if (player.gamemode === Gametype.SPECTATOR) return; // Spectators pass through the world without touching it.

        const reason = rejectionReason(packet);
        if (reason !== null) {
            server
                .getLogger()
                .debug(
                    `Dropped an inventory transaction from ${player.getName()}: ${reason}`,
                    'InventoryTransactionHandler/handle'
                );
            return;
        }

        const data = packet.transactionData;
        if (data === null) {
            // The client's idea of an inventory did not match what it was sent. Nothing here
            // can be applied, but a client saying so is ordinary traffic, not a fault, and it
            // used to be thrown on.
            if (packet.transactionType === TransactionType.MISMATCH) {
                server.getLogger().verbose(`${player.getName()} reported an inventory mismatch`);
            } else {
                this.handleNormal(packet, server, player);
            }
            return;
        }

        const handSlot = player.getInventory().getHandSlotIndex();
        if (data.hotbarSlot !== handSlot) {
            server
                .getLogger()
                .verbose(
                    `Dropped an inventory transaction from ${player.getName()}: it names hotbar slot ${data.hotbarSlot} and the server has ${handSlot} selected`,
                    'InventoryTransactionHandler/handle'
                );
            return;
        }

        switch (data.kind) {
            case 'useItem':
                await this.handleUseItem(data, server, player);
                return;
            case 'useItemOnEntity':
                await this.handleUseItemOnEntity(data, server, player);
                return;
            case 'releaseItem':
                await this.handleReleaseItem(data, server, player);
                return;
        }
    }

    /**
     * Items being moved around, between slots or in and out of a container.
     *
     * Decoded but not applied. The server's inventory is authoritative, and a 2193 client
     * moves items through the ItemStackRequest path, so a Normal transaction is a legacy
     * client's and its actions are only logged. Applying them would mean trusting the
     * client's From Item and To Item over what the server holds.
     */
    private handleNormal(packet: InventoryTransactionPacket, server: Server, player: Player): void {
        const sources = packet.inventoryActions.map((action) => InventorySourceType[action.sourceType]).join(', ');
        server
            .getLogger()
            .debug(
                `Ignored a Normal inventory transaction from ${player.getName()} with ${packet.inventoryActions.length} actions (${sources}); item moves go through ItemStackRequest`,
                'InventoryTransactionHandler/handleNormal'
            );
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
    private async handleUseItemOnEntity(data: UseItemOnEntityData, server: Server, player: Player): Promise<void> {
        if (
            data.actionType === ItemUseOnActorActionType.INTERACT ||
            data.actionType === ItemUseOnActorActionType.ITEM_INTERACT
        ) {
            // Entity interactions and targeted item uses both enter the content path. The latter
            // includes spawn eggs; the item's `onUse` reads the clicked entity through `targetOf`.
            contentUseOnEntity(server, player, data);
            return;
        }

        if (data.actionType !== ItemUseOnActorActionType.ATTACK) return;

        const target = player.getWorld().getEntity(data.entityRuntimeId);
        if (!target) {
            server
                .getLogger()
                .verbose(
                    `${player.getName()} swung at runtime id ${data.entityRuntimeId}, which is not an entity here`,
                    'InventoryTransactionHandler/handleUseItemOnEntity'
                );
            return;
        }

        const landed = await meleeAttack(player, target, {
            reach: player.gamemode === Gametype.CREATIVE ? CREATIVE_REACH : SURVIVAL_REACH,

            // What they are holding, not their attack attribute: in vanilla the weapon *is* the
            // number, and an empty hand is one point rather than none.
            damage: player.getInventory().getItemInHand().getAttackDamage(),

            // Falling, and actually descending: a player on the way up through a jump is off the
            // ground too, and vanilla does not let them crit from there.
            critical: !player.isOnGround() && player.getFallDistance() > 0 && !player.isFlying(),

            knockbackLevels: player.metadata.sprinting ? SPRINT_KNOCKBACK : 0
        });

        // Only a swing that connected costs anything. A miss is free, which is why the hunger is
        // charged here rather than before the attempt.
        if (landed) player.addExhaustion(EXHAUSTION.attacking);
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
    private async handleReleaseItem(data: ReleaseItemData, server: Server, player: Player): Promise<void> {
        const drawn = player.takeItemUseTicks(server.getTick());

        if (data.actionType !== ItemReleaseActionType.RELEASE) return;
        if (player.getInventory().getItemInHand().getName() !== BOW) return;

        await loose(player, drawn);
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
    private async handleUseItem(data: UseItemData, server: Server, player: Player): Promise<void> {
        switch (data.actionType) {
            case ItemUseActionType.PLACE:
            case ItemUseActionType.DESTROY: {
                const distance = player.getPosition().distanceTo(data.blockPosition);
                if (!Number.isFinite(distance) || distance > MAX_BLOCK_TARGET_DISTANCE) {
                    server
                        .getLogger()
                        .verbose(
                            `Dropped item use ${ItemUseActionType[data.actionType]} from ${player.getName()} on a block ${distance.toFixed(1)} away`,
                            'InventoryTransactionHandler/handleUseItem'
                        );
                    return;
                }

                if (data.actionType === ItemUseActionType.PLACE) {
                    // The block's and the item's behavior families get the click, and the block
                    // in hand goes down when neither takes it. What a click they all decline
                    // gets is nothing: the item places no block, so the client predicted none.
                    contentUse(server, player, data);
                    return;
                }

                // Survival's route into a break when the client times it. With
                // server-authoritative block breaking the client reports the break as
                // `PREDICT_DESTROY_BLOCK` instead, and a transaction saying a block broke is one
                // that skipped the mining the server is timing. Creative announces the same
                // thing through PlayerAction, and both end up in `breakBlock`, which does
                // nothing the second time round.
                if (server.getConfig().getServerAuthoritativeBlockBreaking()) {
                    server
                        .getLogger()
                        .verbose(
                            `Dropped a block break transaction from ${player.getName()}: block breaking is server-authoritative`,
                            'InventoryTransactionHandler/handleUseItem'
                        );
                    return;
                }

                await player.getWorld().breakBlock(data.blockPosition, player);
                return;
            }

            case ItemUseActionType.USE:
                // Bedrock never says how long a bow was drawn for. It says "started" here and
                // "released" in another transaction entirely, and the gap between the two is the
                // charge. So the clock starts here.
                if (player.getInventory().getItemInHand().getName() === BOW) {
                    player.beginItemUse(server.getTick());
                }

                // Eating and throwing on a click at nothing are not implemented. Each needs
                // the server to change the held slot and tell the client, and neither does yet.
                return;

            // A swing at nothing. Hitting an entity arrives as `USE_ITEM_ON_ENTITY` instead,
            // so there is nothing here to apply.
            case ItemUseActionType.USE_AS_ATTACK:
                return;
        }
    }
}
