import { Gametype } from '@jsprismarine/minecraft';
import type { PlayerSession } from '../../';
import { EXHAUSTION } from '../../Player';
import type Server from '../../Server';
import { BOW, loose } from '../../entity/Archery';
import { CREATIVE_REACH, meleeAttack, SURVIVAL_REACH } from '../../entity/Combat';
import Identifiers from '../Identifiers';
import type { InventoryTransactionPacket } from '../Packets';
import type { UseItemData, UseItemOnEntityData } from '../packet/InventoryTransactionPacket';
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

            case TransactionType.RELASE_ITEM:
                await this.handleReleaseItem(server, connection);
                return;

            default:
                // Unreachable in practice: the packet refuses to decode a type it does not
                // know, so anything arriving here is one this switch has not caught up with.
                server.getLogger().verbose(`Unknown inventory transaction type: ${packet.transactionType}`);
        }
    }

    /** Items being moved around, between slots or in and out of a container. */
    private async handleNormal(packet: InventoryTransactionPacket, server: Server): Promise<void> {
        // TODO: refactor this crap.
        // probably base it on https://github.com/pmmp/PocketMine-MP/blob/d19db5d2e44d0925798c288247c3bddb71d23975/src/pocketmine/Player.php#L2399 or something similar.
        // let movedItem: ContainerEntry | null;
        for (const action of packet.inventoryActions) {
            switch (action.sourceType) {
                case ActionSource.CONTAINER: {
                    // FIXME: Hack for creative inventory
                    /*if (action.windowId === 124) {
                        // from creative inventory
                        if (player.gamemode !== 1) throw new Error(`Player isn't in creative mode`);

                        // const id = action.oldItem.getId();
                        // const meta = action.oldItem.meta;

                        // const item =
                        //    server.getItemManager().getItemById(id) ??
                        //    server.getBlockManager().getBlockByIdAndMeta(id, meta);
                        // const count = 64;

                        // movedItem = new ContainerEntry({
                        //    item,
                        //    count
                        // });
                        return;
                    }

                    if (action.newItem.getId() === 0) {
                        // movedItem = player.getInventory().getItem(action.targetSlot);
                        player.getInventory().removeItem(action.targetSlot);
                        return;
                    }

                    if (!movedItem) {
                        server.getLogger().debug(`movedItem is undefined`);
                        return;
                    }

                    player.getInventory().setItem(action.targetSlot, movedItem);*/
                    break;
                }

                default:
                    server.getLogger().debug(`Unknown source type: ${action.sourceType}`);
            }
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
        const data = <UseItemOnEntityData>packet.transactionData;

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
     * thing - telling the client that a slot has changed - and both are left with the armour work
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
        const useItemData = <UseItemData>packet.transactionData;

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

                // TODO: the rest of using an item on nothing - eating, throwing.
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
