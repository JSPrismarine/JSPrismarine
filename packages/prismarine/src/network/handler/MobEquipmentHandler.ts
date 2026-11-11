import { WindowIds } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import HumanInventory from '../../inventory/HumanInventory';
import type MobEquipmentPacket from '@jsprismarine/protocol/packet/MobEquipmentPacket';
import type PacketHandler from './PacketHandler';

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
export default class MobEquipmentHandler implements PacketHandler<MobEquipmentPacket> {
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
    public async handle(packet: MobEquipmentPacket, server: Server, session: PlayerSession): Promise<void> {
        const data = packet.getPacketData();
        if (data === null) return;

        if (data.windowId === WindowIds.OFFHAND) return;

        if (data.windowId !== WindowIds.INVENTORY) {
            server
                .getLogger()
                .debug(
                    `${session.identity.name} reported equipment for container ${data.windowId}; dropped`,
                    'MobEquipmentHandler/handle'
                );
            return;
        }

        if (!HumanInventory.isHotbarSlot(data.hotbarSlot) || !HumanInventory.isHotbarSlot(data.inventorySlot)) {
            server
                .getLogger()
                .debug(
                    `${session.identity.name} selected slot ${data.hotbarSlot} (slot ${data.inventorySlot}), which is outside the hotbar; dropped`,
                    'MobEquipmentHandler/handle'
                );
            return;
        }

        // The players that see the sender are shown the stack now in its hand by
        // `StoreActors.sync`, which reads the inventory each tick, with the armor and the off hand.
        session.getPlayer().getInventory().setHandSlot(data.hotbarSlot);
    }
}
