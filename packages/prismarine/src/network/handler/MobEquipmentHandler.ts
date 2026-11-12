import { WindowIds } from '@jsprismarine/minecraft';

import HumanInventory from '../../inventory/HumanInventory';
import { blockMiningOf, playerMiningOf } from '../../world/BlockMining';
import type MobEquipmentPacket from '@jsprismarine/protocol/packet/MobEquipmentPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * A client reporting which hotbar slot it holds.
 *
 * The client sends this for its own inventory (`Container ID` 0) when the selected slot
 * changes, with `Slot` and `Selected Slot` both naming the new hotbar slot, and for the offhand
 * container (119) when the off hand changes. Only the slot is taken. The stack the client names
 * alongside it is its own view of the inventory, and the server's copy is the one that decides
 * what a player is holding.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/mob-equipment-packet/
 */
export default class MobEquipmentHandler implements InputLaneHandler<MobEquipmentPacket> {
    public static PacketName = 'MobEquipmentPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /**
     * Moves the player's hand to the reported hotbar slot. What the server says is in it reaches
     * the players that have the sender on screen with the next tick's sync.
     *
     * An offhand report is accepted and ignored, since the off hand is kept through the item
     * stack requests that moved something into it. A packet naming any other container, or a
     * slot outside the hotbar, is dropped and logged.
     */
    public handle(packet: MobEquipmentPacket, { session, log }: InputContext): undefined {
        const data = packet.getPacketData();
        if (data === null) return;

        if (data.windowId === WindowIds.OFFHAND) return;

        if (data.windowId !== WindowIds.INVENTORY) {
            log.debug(
                `${session.identity.name} reported equipment for container ${data.windowId}; dropped`,
                'MobEquipmentHandler/handle'
            );
            return;
        }

        if (!HumanInventory.isHotbarSlot(data.hotbarSlot) || !HumanInventory.isHotbarSlot(data.inventorySlot)) {
            log.debug(
                `${session.identity.name} selected slot ${data.hotbarSlot} (slot ${data.inventorySlot}), which is outside the hotbar; dropped`,
                'MobEquipmentHandler/handle'
            );
            return;
        }

        // The players that see the sender are shown the stack now in its hand by replication,
        // from the logged hand slot, with the armor and the off hand.
        const player = session.getPlayer();
        const inventory = player.getInventory();
        const previousSlot = inventory.getHandSlotIndex();
        inventory.setHandSlot(data.hotbarSlot);

        // A block being mined was timed for the tool held when mining began. A switch starts the
        // mining over for the new tool, as a Bedrock client restarts its own break progress, so a
        // fast tool's time cannot be kept for a block finished with a slow one. A report of the
        // slot already held changes nothing.
        const mining = blockMiningOf(player.getComponents().get('mining.block'));
        if (mining !== null && data.hotbarSlot !== previousSlot) {
            const world = session.getWorld();
            world.stopBlockCracking(mining.position);
            const restarted = world.startBlockCracking(mining.position, mining.face, inventory.getItemInHand(), null);
            session.inputs().setPlayerMining(player, playerMiningOf(restarted));
        }
    }
}
