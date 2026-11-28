import type PlayerToggleCrafterSlotRequestPacket from '@jsprismarine/protocol/bedrock/packet/PlayerToggleCrafterSlotRequestPacket';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** A crafter slot toggle, which names the crafter by its position. */
export default class PlayerToggleCrafterSlotRequestDecoder implements PacketDecoder<
    PlayerToggleCrafterSlotRequestPacket,
    'toggleCrafterSlot'
> {
    public static readonly PacketName = 'PlayerToggleCrafterSlotRequestPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['toggleCrafterSlot'] as const;

    /** Decodes the crafter's position, the slot and whether it is now off. */
    public decode(
        packet: PlayerToggleCrafterSlotRequestPacket,
        _view: DecodeView
    ): readonly Intent<'toggleCrafterSlot'>[] {
        return [
            {
                kind: 'toggleCrafterSlot',
                position: { x: packet.posX, y: packet.posY, z: packet.posZ },
                slot: packet.slotIndex,
                disabled: packet.isDisabled
            }
        ];
    }
}
