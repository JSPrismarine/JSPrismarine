import { WindowIds } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import HumanInventory from '../../inventory/HumanInventory';
import MobEquipmentPacket from '../packet/MobEquipmentPacket';
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

    /**
     * Moves the player's hand to the reported hotbar slot and shows the players that have the
     * sender on screen what the server says is in it.
     *
     * An offhand report is accepted and ignored, since the off hand is kept through the item
     * stack requests that moved something into it. A packet naming any other container, or a
     * slot outside the hotbar, is dropped and logged.
     */
    public async handle(packet: MobEquipmentPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

        if (packet.windowId === WindowIds.OFFHAND) return;

        if (packet.windowId !== WindowIds.INVENTORY) {
            server
                .getLogger()
                .debug(
                    `${player.getName()} reported equipment for container ${packet.windowId}; dropped`,
                    'MobEquipmentHandler/handle'
                );
            return;
        }

        if (!HumanInventory.isHotbarSlot(packet.hotbarSlot) || !HumanInventory.isHotbarSlot(packet.inventorySlot)) {
            server
                .getLogger()
                .debug(
                    `${player.getName()} selected slot ${packet.hotbarSlot} (slot ${packet.inventorySlot}), which is outside the hotbar; dropped`,
                    'MobEquipmentHandler/handle'
                );
            return;
        }

        const inventory = player.getInventory();
        inventory.setHandSlot(packet.hotbarSlot);

        // The server's stack for that slot under the sender's runtime id, not the client's
        // bytes forwarded: a client could otherwise show everyone else an item it does not have.
        const relay = new MobEquipmentPacket();
        relay.runtimeEntityId = player.getRuntimeId();
        relay.item = inventory.getItemInHand();
        relay.inventorySlot = packet.hotbarSlot;
        relay.hotbarSlot = packet.hotbarSlot;
        relay.windowId = WindowIds.INVENTORY;

        // The sender's own world, and only the clients that have them on screen, the scope
        // `AnimateHandler` relays an arm swing in.
        await Promise.all(
            player
                .getWorld()
                .getPlayers()
                .filter((other) => other !== player)
                .filter((other) => other.getNetworkSession().tracks(player.getRuntimeId()))
                .map(async (other) => other.getNetworkSession().send(relay))
        );
    }
}
