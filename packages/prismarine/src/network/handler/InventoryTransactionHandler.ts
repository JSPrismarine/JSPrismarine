import { Gametype } from '@jsprismarine/minecraft';
import type { PlayerSession } from '../../';
import { EXHAUSTION } from '../../Player';
import type Server from '../../Server';
import { BOW, loose } from '../../entity/Archery';
import { CREATIVE_REACH, meleeAttack, SURVIVAL_REACH } from '../../entity/Combat';
import Identifiers from '../Identifiers';
import type { InventoryTransactionPacket } from '../Packets';

import {
    ActionSource,
    TransactionType,
    UseItemAction,
    UseItemOnEntityAction
} from '../packet/InventoryTransactionPacket';
import type PacketHandler from './PacketHandler';

/**
 * What sprinting is worth in knockback levels.
 *
 * One, the same as a level of the Knockback enchantment - which is why a sprint-hit sends
 * somebody flying and a standing one nudges them.
 */
const SPRINT_KNOCKBACK = 1;

export default class InventoryTransactionHandler implements PacketHandler<InventoryTransactionPacket> {
    public static NetID = Identifiers.InventoryTransactionPacket;

    public async handle(packet: InventoryTransactionPacket, server: Server, connection: PlayerSession): Promise<void> {
        const player = connection.getPlayer();
        if (!player.isOnline()) return;
        if (player.gamemode === Gametype.SPECTATOR) return; // Spectators shouldn't be able to interact with the world.

        switch (packet.transactionType) {
            case TransactionType.NORMAL:
                await this.handleNormal(packet, server);
                return;

            case TransactionType.USE_ITEM:
                await this.handleUseItem(packet, server, connection);
                return;

            // The client's idea of an inventory did not match what it was sent. Nothing here
            // can be applied - the answer is to send the inventory back - but a client saying
            // so is ordinary traffic, not a fault, and it used to be thrown on.
            case TransactionType.MISMATCH:
                server.getLogger().verbose(`${player.getName()} reported an inventory mismatch`);
                return;

            case TransactionType.USE_ITEM_ON_ENTITY:
                await this.handleUseItemOnEntity(packet, server, connection);
                return;

            case TransactionType.RELEASE_ITEM:
                await this.handleReleaseItem(server, connection);
                return;

            default:
                // Unreachable in practice: the packet refuses to decode a type it does not
                // know, so anything arriving here is one this switch has not caught up with.
                server.getLogger().verbose(`Unknown inventory transaction type: ${packet.transactionType}`);
        }
    }

    /**
     * Items being moved around, between slots or in and out of a container.
     *
     * Decoded but not applied. The server's inventory is authoritative, and container moves
     * reach it through the ItemStackRequest path, so a Normal transaction's actions are only
     * logged. Applying them here would mean trusting the client's From Item and To Item over
     * what the server holds.
     */
    private async handleNormal(packet: InventoryTransactionPacket, server: Server): Promise<void> {
        for (const action of packet.inventoryActions) {
            if (action.sourceType === ActionSource.CONTAINER) continue;

            server.getLogger().debug(`Unknown source type: ${action.sourceType}`);
        }
    }

    /**
     * The item in hand being used *on an entity*, which is how a melee attack arrives.
     *
     * Not through `InteractPacket`, which is what its name suggests and which is why this sat
     * unimplemented for so long: `InteractPacket` carries mounting, dismounting and opening a
     * villager's trades, and a swing comes through here instead. The packet was already decoded
     * in full - only this branch was missing, so every attack a client ever sent was logged and
     * thrown away.
     */
    private async handleUseItemOnEntity(
        packet: InventoryTransactionPacket,
        server: Server,
        connection: PlayerSession
    ): Promise<void> {
        const player = connection.getPlayer();
        const data = packet.transactionData;
        if (data?.kind !== 'useItemOnEntity') return;

        // Interacting and using an item on something are not attacks - shearing a sheep, putting a
        // saddle on a pig - and are not handled yet.
        if (data.actionType !== UseItemOnEntityAction.ATTACK) return;

        // By runtime id through the world's own map. Walking `getEntities()` would be a linear
        // scan of everything in the world on every swing of every player.
        const target = player.getWorld().getEntity(data.entityRuntimeId);
        if (!target) {
            // Ordinary traffic rather than a fault: a client can swing at something the server
            // removed in the same tick.
            server.getLogger().verbose(`${player.getName()} swung at an entity that is no longer here`);
            return;
        }

        const landed = await meleeAttack(player, target, {
            reach: player.gamemode === Gametype.CREATIVE ? CREATIVE_REACH : SURVIVAL_REACH,

            // What they are holding, not their attack attribute: in vanilla the weapon *is* the
            // number, and an empty hand is one point rather than none.
            damage: player.getInventory().getItemInHand().getAttackDamage(),

            // Falling, and actually descending - a player on the way up through a jump is off the
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
     * The charge is measured rather than sent - see the `CLICK_AIR` branch above for why.
     *
     * The arrow is not taken out of the inventory and the bow is not worn down. Both need the same
     * thing - telling the client that a slot has changed - and both are left with the armor work
     * where that lives, because a server that silently disagrees with the client about what is in
     * a player's hand is worse than one that has not got round to the accounting.
     */
    private async handleReleaseItem(server: Server, connection: PlayerSession): Promise<void> {
        const player = connection.getPlayer();
        const drawn = player.takeItemUseTicks(server.getTick());

        if (player.getInventory().getItemInHand().getName() !== BOW) return;

        await loose(player, drawn);
    }

    /** The item in hand being used: on a block, on nothing, or to break a block. */
    private async handleUseItem(
        packet: InventoryTransactionPacket,
        server: Server,
        connection: PlayerSession
    ): Promise<void> {
        const player = connection.getPlayer();
        const useItemData = packet.transactionData;
        if (useItemData?.kind !== 'useItem') return;

        switch (useItemData.actionType) {
            case UseItemAction.CLICK_BLOCK:
                await player
                    .getWorld()
                    .useItemOn(
                        server
                            .getBlockManager()
                            .getBlockByIdAndMeta(useItemData.itemInHand.getId(), useItemData.itemInHand.meta),
                        useItemData.blockPosition,
                        useItemData.blockFace,
                        useItemData.clickPosition,
                        player
                    );
                return;

            case UseItemAction.CLICK_AIR:
                // Bedrock never says how long a bow was drawn for - it says "started" here and
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
            case UseItemAction.USE_AS_ATTACK:
                return;

            // Survival's route into a break. Creative announces the same thing through
            // PlayerAction instead, and both end up in `breakBlock`, which does nothing the
            // second time round.
            case UseItemAction.BREAK_BLOCK:
                await player.getWorld().breakBlock(useItemData.blockPosition, player);
                return;

            default:
                server.getLogger().debug(`Unknown action type: ${useItemData.actionType}`);
        }
    }
}
