import { WindowIds } from '@jsprismarine/minecraft';
import type MobEquipmentPacket from '@jsprismarine/protocol/bedrock/packet/MobEquipmentPacket';

import HumanInventory from '../../inventory/HumanInventory';
import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * A client reporting which hotbar slot it holds.
 *
 * The client sends this for its own inventory (`Container ID` 0) when the selected slot changes,
 * with `Slot` and `Selected Slot` both naming the new hotbar slot, and for the offhand container
 * (119) when the off hand changes. Only the slot is taken. The stack the client names alongside
 * it is its own view of the inventory, and the server's copy is the one that decides what a
 * player is holding. An offhand report is accepted and decodes to nothing, since the off hand is
 * kept through the item stack requests that moved something into it. A packet naming any other
 * container, or a slot outside the hotbar, is dropped and logged.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/mob-equipment-packet/
 */
export default class MobEquipmentDecoder implements PacketDecoder<MobEquipmentPacket, 'selectHotbarSlot'> {
    public static readonly PacketName = 'MobEquipmentPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['selectHotbarSlot'] as const;

    /** Decodes a hotbar selection for the player's own inventory. */
    public decode(packet: MobEquipmentPacket, view: DecodeView): readonly Intent<'selectHotbarSlot'>[] {
        const data = packet.getPacketData();
        if (data === null) return [];

        if (data.windowId === WindowIds.OFFHAND) return [];

        if (data.windowId !== WindowIds.INVENTORY) {
            view.log.debug(`${view.name} reported equipment for container ${data.windowId}; dropped`);
            return [];
        }

        if (!HumanInventory.isHotbarSlot(data.hotbarSlot) || !HumanInventory.isHotbarSlot(data.inventorySlot)) {
            view.log.debug(
                `${view.name} selected slot ${data.hotbarSlot} (slot ${data.inventorySlot}), which is outside the hotbar; dropped`
            );
            return [];
        }

        return [{ kind: 'selectHotbarSlot', slot: data.hotbarSlot }];
    }
}
